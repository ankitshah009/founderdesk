import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appSecret, env } from "@/lib/env";
import { safeNext } from "@/lib/auth-google";

/**
 * Sign-in that stays on founderdesk: our own screens, WorkOS underneath.
 *  - Email: WorkOS Magic Auth emails a 6-digit code; the founder types it on our page.
 *  - Google: straight to Google's account picker via WorkOS, skipping WorkOS's page.
 * WorkOS verifies every sign-in and owns the user record; FounderDesk then
 * opens its own session for the verified email, exactly like the other paths.
 */

let client: import("@workos-inc/node").WorkOS | null = null;

async function workos() {
  if (!client) {
    const { WorkOS } = await import("@workos-inc/node");
    client = new WorkOS(process.env.WORKOS_API_KEY!, { clientId: process.env.WORKOS_CLIENT_ID! });
  }
  return client;
}

export class WorkOSSignInError extends Error {}

/** Friendly text for WorkOS API errors; never leaks internals. */
function friendly(err: unknown, fallback: string): WorkOSSignInError {
  const e = err as { code?: string; error?: string; status?: number; message?: string };
  const code = e.code ?? e.error ?? "";
  if (/invalid_one_time_code|invalid_code|expired/i.test(code) || /code/i.test(e.message ?? "")) return new WorkOSSignInError("That code didn't work. Check it, or send a new one.");
  if (e.status === 429 || /rate/i.test(code)) return new WorkOSSignInError("Too many attempts. Wait a minute, then try again.");
  return new WorkOSSignInError(fallback);
}

export async function sendEmailCode(email: string, meta: { ip?: string; userAgent?: string } = {}): Promise<void> {
  try {
    await (await workos()).userManagement.createMagicAuth({ email, ipAddress: meta.ip, userAgent: meta.userAgent });
  } catch (err) {
    console.error("[founderdesk] WorkOS magic auth send failed", (err as Error).message);
    throw friendly(err, "We couldn't send a code just now. Try again in a moment.");
  }
}

/** Returns the verified email (lowercase) and name, or throws a friendly error. */
export async function verifyEmailCode(email: string, code: string, meta: { ip?: string; userAgent?: string } = {}): Promise<{ email: string; name: string }> {
  try {
    const res = await (await workos()).userManagement.authenticateWithMagicAuth({
      clientId: process.env.WORKOS_CLIENT_ID!,
      email,
      code,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return verified(res.user);
  } catch (err) {
    if (err instanceof WorkOSSignInError) throw err;
    throw friendly(err, "We couldn't verify that code. Send a new one and try again.");
  }
}

function verified(user: { email: string; emailVerified: boolean; firstName: string | null; lastName: string | null }) {
  // Our data is keyed by email, so only a verified address may open a session.
  if (!user.emailVerified) throw new WorkOSSignInError("Verify your email address first, then sign in again.");
  return { email: user.email.trim().toLowerCase(), name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() };
}

/* ── Google, without the hosted page ───────────────────────────────────── */

export const OAUTH_COOKIE = "fd_oauth";

export function oauthCallbackUri(): string {
  return `${env().APP_URL.replace(/\/$/, "")}/auth/oauth/callback`;
}

function sign(body: string): string {
  return createHmac("sha256", appSecret()).update(`workos-oauth:${body}`).digest("base64url");
}

/**
 * The URL that sends the founder straight to Google (through WorkOS), plus a
 * signed state carrying where to land. The nonce is also set as a cookie, so
 * the callback only accepts the browser that started the flow.
 */
export async function googleSignInUrl(rawNext: string | null | undefined): Promise<{ url: string; nonce: string }> {
  const nonce = randomBytes(16).toString("base64url");
  const body = Buffer.from(JSON.stringify({ n: nonce, next: safeNext(rawNext), e: Date.now() + 10 * 60_000 })).toString("base64url");
  const url = (await workos()).userManagement.getAuthorizationUrl({
    provider: "GoogleOAuth",
    clientId: process.env.WORKOS_CLIENT_ID!,
    redirectUri: oauthCallbackUri(),
    state: `${body}.${sign(body)}`,
  });
  return { url, nonce };
}

export function readOAuthState(state: string | null, cookieNonce: string | undefined): { next: string } | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig || !cookieNonce) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const s = JSON.parse(Buffer.from(body, "base64url").toString()) as { n: string; next: string; e: number };
  if (s.e < Date.now() || s.n !== cookieNonce) return null;
  return { next: safeNext(s.next) };
}

export async function finishOAuth(code: string, meta: { ip?: string; userAgent?: string } = {}): Promise<{ email: string; name: string }> {
  try {
    const res = await (await workos()).userManagement.authenticateWithCode({ clientId: process.env.WORKOS_CLIENT_ID!, code, ipAddress: meta.ip, userAgent: meta.userAgent });
    return verified(res.user);
  } catch (err) {
    if (err instanceof WorkOSSignInError) throw err;
    throw friendly(err, "Google sign-in didn't complete. Try again, or use an email code.");
  }
}
