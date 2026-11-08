import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers stand-ins: one cookie jar and a configurable client IP.
const jar = new Map<string, string>();
let ip = "203.0.113.7";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => new Headers({ "x-forwarded-for": ip, "user-agent": "vitest" }),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const { getDb, resetDbForTests } = await import("@/lib/db/client");
const { authChallenges, authEvents, authSessions } = await import("@/lib/db/schema");
const auth = await import("@/lib/auth");
const { createJob } = await import("@/lib/workflow/intake");

const EMAIL = "founder@acme.test";

async function withOrder(email = EMAIL) {
  await createJob({ channel: "web", founderEmail: email, subject: "x", body: "I want to write about testing authentication properly. My audience is founders." });
}

describe("passwordless sign-in", () => {
  beforeEach(() => {
    jar.clear();
    ip = `203.0.113.${Math.floor(Math.random() * 200)}`;
  });
  afterAll(async () => resetDbForTests());

  it("does not reveal whether an email has orders, and stores only hashes", async () => {
    const unknown = await auth.startChallenge("nobody@acme.test");
    expect(unknown.sent).toBe(false);
    await withOrder();
    const known = await auth.startChallenge(EMAIL);
    expect(known.sent).toBe(true);
    const db = await getDb();
    const [row] = await db.select().from(authChallenges).where(eq(authChallenges.id, known.challengeId!));
    expect(row!.codeHash).not.toContain(known.code!);
    expect(row!.linkTokenHash).not.toBe(new URL(known.link!).searchParams.get("t"));
  });

  it("magic link signs in once, then is dead", async () => {
    const ch = await auth.startChallenge(EMAIL);
    const t = new URL(ch.link!).searchParams.get("t")!;
    expect(await auth.consumeLink(ch.challengeId!, t)).toBe(EMAIL);
    await expect(auth.consumeLink(ch.challengeId!, t)).rejects.toBeInstanceOf(auth.AuthError);
  });

  it("rejects a forged or mismatched link token", async () => {
    const ch = await auth.startChallenge(EMAIL);
    await expect(auth.consumeLink(ch.challengeId!, "forged-token")).rejects.toBeInstanceOf(auth.AuthError);
  });

  it("concurrent use of one link lets exactly one through", async () => {
    const ch = await auth.startChallenge(EMAIL);
    const t = new URL(ch.link!).searchParams.get("t")!;
    const results = await Promise.allSettled([auth.consumeLink(ch.challengeId!, t), auth.consumeLink(ch.challengeId!, t), auth.consumeLink(ch.challengeId!, t)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("expired challenges cannot be used", async () => {
    const ch = await auth.startChallenge(EMAIL);
    const db = await getDb();
    await db.update(authChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authChallenges.id, ch.challengeId!));
    await expect(auth.consumeLink(ch.challengeId!, new URL(ch.link!).searchParams.get("t")!)).rejects.toBeInstanceOf(auth.AuthError);
    await expect(auth.consumeCode(EMAIL, ch.code!)).rejects.toBeInstanceOf(auth.AuthError);
  });

  it("the 6-digit code works once and locks after 5 wrong attempts", async () => {
    const E = "codes@acme.test";
    await withOrder(E);
    const ok = await auth.startChallenge(E);
    expect(await auth.consumeCode(E, ok.code!)).toBe(E);
    await expect(auth.consumeCode(E, ok.code!)).rejects.toBeInstanceOf(auth.AuthError);

    const ch = await auth.startChallenge(E);
    const wrong = ch.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(auth.consumeCode(E, wrong)).rejects.toBeInstanceOf(auth.AuthError);
    // Even the right code is refused once the attempts are spent.
    await expect(auth.consumeCode(E, ch.code!)).rejects.toBeInstanceOf(auth.AuthError);
  });

  it("rate-limits challenges per email", async () => {
    await withOrder("busy@acme.test");
    for (let i = 0; i < 5; i++) await auth.startChallenge("busy@acme.test");
    await expect(auth.startChallenge("busy@acme.test")).rejects.toThrow(/Too many/);
  });

  it("sessions: cookie holds the token, database holds only its hash; revocation is immediate", async () => {
    await auth.createSession(EMAIL);
    const token = jar.get(auth.SESSION_COOKIE)!;
    expect(token.length).toBeGreaterThan(40);
    const db = await getDb();
    const rows = await db.select().from(authSessions).where(eq(authSessions.email, EMAIL));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect((await auth.currentSession())?.email).toBe(EMAIL);

    await auth.signOut();
    expect(jar.has(auth.SESSION_COOKIE)).toBe(false);
    jar.set(auth.SESSION_COOKIE, token); // replaying the old cookie must fail
    expect(await auth.currentSession()).toBeNull();
  });

  it("sign out everywhere revokes every session for the email", async () => {
    await auth.createSession(EMAIL);
    const a = jar.get(auth.SESSION_COOKIE)!;
    await auth.createSession(EMAIL);
    await auth.signOut(true);
    jar.set(auth.SESSION_COOKIE, a);
    expect(await auth.currentSession()).toBeNull();
  });

  it("writes an audit trail with hashed IPs", async () => {
    const db = await getDb();
    const events = await db.select().from(authEvents);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["challenge.sent", "challenge.unknown_email", "session.created", "session.revoked"]));
    expect(events.every((e) => !e.ipHash || !e.ipHash.includes("203.0.113"))).toBe(true);
  });
});
