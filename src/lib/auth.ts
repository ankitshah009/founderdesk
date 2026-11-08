import "server-only";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { authChallenges, authEvents, authSessions, jobs } from "@/lib/db/schema";
import { appSecret, env, isLive } from "@/lib/env";
import { safeEqual, sha256 } from "@/lib/security";

/**
 * Passwordless authentication.
 *
 *  - Sign-in challenge: one email carrying a magic link and a 6-digit code.
 *    Both are single-use, expire in 10 minutes, and only their hashes are
 *    stored. Codes allow 5 attempts. Consumption is an atomic conditional
 *    UPDATE, so concurrent attempts cannot both succeed.
 *  - Links open a confirmation page; the session is created on POST, so
 *    corporate mail scanners that prefetch links cannot sign anyone in.
 *  - Sessions: random 256-bit token in an HttpOnly, Secure, SameSite=Lax
 *    cookie; the database holds only its SHA-256 hash, so a database leak does
 *    not leak live sessions. Sessions are revocable individually or all at once.
 *  - Rate limits: 5 challenges per email and 20 per IP per hour. Responses do
 *    not reveal whether an email has orders.
 *  - Every security-relevant action is written to auth_events (IPs hashed).
 */

export const SESSION_COOKIE = "fd_session";
const SESSION_DAYS = 30;
const CHALLENGE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_PER_EMAIL_HOUR = 5;
const MAX_PER_IP_HOUR = 20;

const normalize = (email: string) => email.trim().toLowerCase();
const isEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
const keyed = (purpose: string, v: string) => createHmac("sha256", appSecret()).update(`${purpose}:${v}`).digest("hex");

async function client() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "unknown";
  return { ipHash: keyed("ip", ip), userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

export async function audit(type: string, email: string | null, detail?: string) {
  const db = await getDb();
  const c = await client().catch(() => ({ ipHash: null, userAgent: null }));
  await db.insert(authEvents).values({ type, email, detail: detail ?? null, ...c });
}

/* ── Challenges ───────────────────────────────────────────────────────────── */

export type ChallengeResult = { sent: boolean; challengeId?: string; link?: string; code?: string };

/**
 * Create a sign-in challenge and email it. Always resolves the same way to the
 * caller (no enumeration); `sent` is for logging and tests only.
 */
export async function startChallenge(rawEmail: string, opts: { deliver?: boolean } = {}): Promise<ChallengeResult> {
  const email = normalize(rawEmail);
  if (!isEmail(email)) throw new AuthError("Enter a valid email address.");
  const db = await getDb();
  const { ipHash } = await client();
  const hourAgo = new Date(Date.now() - 3600_000);
  const [[byEmail], [byIp]] = await Promise.all([
    db.select({ n: count() }).from(authChallenges).where(and(eq(authChallenges.email, email), gt(authChallenges.createdAt, hourAgo))),
    db.select({ n: count() }).from(authChallenges).where(and(eq(authChallenges.ipHash, ipHash), gt(authChallenges.createdAt, hourAgo))),
  ]);
  if (byEmail!.n >= MAX_PER_EMAIL_HOUR || byIp!.n >= MAX_PER_IP_HOUR) {
    await audit("challenge.rate_limited", email);
    throw new AuthError("Too many sign-in requests. Try again in an hour.");
  }
  // Only email addresses with orders get mail; the response is identical.
  const [hasOrders] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.founderEmail, email)).limit(1);
  if (!hasOrders) {
    await audit("challenge.unknown_email", email);
    return { sent: false };
  }
  const linkToken = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [ch] = await db
    .insert(authChallenges)
    .values({
      email,
      linkTokenHash: sha256(linkToken),
      codeHash: keyed("code", code),
      ipHash,
      expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
    })
    .returning();
  const link = `${env().APP_URL.replace(/\/$/, "")}/auth/verify?c=${ch!.id}&t=${linkToken}`;
  if (opts.deliver !== false && isLive("agentmail")) {
    const { sendMessage } = await import("@/lib/integrations/agentmail");
    await sendMessage({
      inboxId: env().AGENTMAIL_INBOX_ID!,
      to: email,
      subject: `${code} is your FounderDesk sign-in code`,
      text: `Sign in to FounderDesk:\n\n${link}\n\nOr enter this code: ${code}\n\nThe link and code work once and expire in ${CHALLENGE_MINUTES} minutes. If you didn't request this, ignore this email — nobody can sign in without it.\n\n— FounderDesk`,
      labels: ["founderdesk", "signin"],
    });
  }
  await audit("challenge.sent", email);
  return { sent: true, challengeId: ch!.id, link, code };
}

/** Consume a challenge by its magic-link token. */
export async function consumeLink(challengeId: string, token: string): Promise<string> {
  const db = await getDb();
  const [ch] = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authChallenges.id, challengeId),
        eq(authChallenges.linkTokenHash, sha256(token)),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!ch) {
    await audit("signin.link_failed", null, challengeId);
    throw new AuthError("This sign-in link has expired or was already used. Request a new one.");
  }
  return ch.email;
}

/** Consume the most recent live challenge for an email by its 6-digit code. */
export async function consumeCode(rawEmail: string, code: string): Promise<string> {
  const email = normalize(rawEmail);
  const db = await getDb();
  // Count the attempt first (atomically), then compare in constant time.
  const [ch] = await db
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(
      and(
        eq(authChallenges.email, email),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, new Date()),
        lt(authChallenges.attempts, MAX_CODE_ATTEMPTS),
        eq(
          authChallenges.id,
          sql`(select id from ${authChallenges} c2 where c2.email = ${email} and c2.consumed_at is null order by c2.created_at desc limit 1)`,
        ),
      ),
    )
    .returning();
  if (!ch || !/^\d{6}$/.test(code) || !safeEqual(ch.codeHash, keyed("code", code))) {
    await audit("signin.code_failed", email);
    throw new AuthError("That code isn't right, or it has expired. Check the latest email or request a new code.");
  }
  const [done] = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(authChallenges.id, ch.id), isNull(authChallenges.consumedAt)))
    .returning();
  if (!done) throw new AuthError("That code was already used.");
  return email;
}

/* ── Sessions ─────────────────────────────────────────────────────────────── */

export async function createSession(email: string): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const c = await client();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(authSessions).values({ email, tokenHash: sha256(token), expiresAt, ...c });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  await audit("session.created", email);
}

export type Session = { id: string; email: string };

export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [s] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, sha256(token)), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  if (!s) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 3600_000) {
    await db.update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, s.id));
  }
  return { id: s.id, email: s.email };
}

export async function signOut(everywhere = false): Promise<void> {
  const s = await currentSession();
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  if (!s) return;
  const db = await getDb();
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(everywhere ? and(eq(authSessions.email, s.email), isNull(authSessions.revokedAt)) : eq(authSessions.id, s.id));
  await audit(everywhere ? "session.revoked_all" : "session.revoked", s.email);
}

export class AuthError extends Error {}
