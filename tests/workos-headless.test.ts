import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "10.7.7.7", "user-agent": "vitest" }),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn(), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("@/lib/workflow/run", () => ({ kick: () => {} }));

const createMagicAuth = vi.fn();
const authenticateWithMagicAuth = vi.fn();
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = {
      createMagicAuth: (...a: unknown[]) => createMagicAuth(...a),
      authenticateWithMagicAuth: (...a: unknown[]) => authenticateWithMagicAuth(...a),
      getAuthorizationUrl: (o: { state: string }) => `https://api.workos.test/authorize?state=${encodeURIComponent(o.state)}`,
      authenticateWithCode: vi.fn(),
    };
  },
}));

const saved = { ...process.env };
beforeAll(() => {
  process.env.WORKOS_API_KEY = "sk_test_x";
  process.env.WORKOS_CLIENT_ID = "client_x";
  process.env.WORKOS_COOKIE_PASSWORD = "p".repeat(40);
});
afterAll(async () => {
  for (const k of ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  const { resetDbForTests } = await import("@/lib/db/client");
  await resetDbForTests();
});

const redirectedTo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { to?: string }).to;
  }
  return undefined;
};

describe("WorkOS sign-in on our own screens", () => {
  it("email code: WorkOS sends and verifies it, then FounderDesk opens its session and applies the landing rule", async () => {
    const { requestSignIn, verifySignInCode } = await import("@/app/actions");
    createMagicAuth.mockResolvedValue({});
    const sent = await requestSignIn(null, fd({ email: "Founder@WorkOS.test", next: "/start" }));
    expect(sent).toMatchObject({ step: "code", email: "founder@workos.test", via: "workos" });
    expect(createMagicAuth).toHaveBeenCalledWith(expect.objectContaining({ email: "founder@workos.test" }));

    authenticateWithMagicAuth.mockResolvedValue({ user: { email: "founder@workos.test", emailVerified: true, firstName: "Fay", lastName: "Lee" } });
    const to = await redirectedTo(verifySignInCode(null, fd({ email: "founder@workos.test", code: "123456", via: "workos", next: "/start" })));
    expect(to).toBe("/studio/onboarding?next=%2Fstart");
    expect(jar.size).toBeGreaterThan(0);
  });

  it("refuses an unverified WorkOS email and shows a friendly error for a bad code", async () => {
    const { verifySignInCode } = await import("@/app/actions");
    authenticateWithMagicAuth.mockResolvedValue({ user: { email: "x@workos.test", emailVerified: false, firstName: null, lastName: null } });
    expect(await verifySignInCode(null, fd({ email: "x@workos.test", code: "111111", via: "workos" }))).toMatchObject({ error: expect.stringMatching(/Verify your email/), step: "code" });
    authenticateWithMagicAuth.mockRejectedValue(Object.assign(new Error("Invalid one-time code"), { code: "invalid_one_time_code" }));
    expect(await verifySignInCode(null, fd({ email: "x@workos.test", code: "000000", via: "workos" }))).toMatchObject({ error: expect.stringMatching(/didn't work/) });
  });

  it("falls back to our own email code when WorkOS can't send one", async () => {
    const { requestSignIn } = await import("@/app/actions");
    createMagicAuth.mockRejectedValue(Object.assign(new Error("Magic Auth is disabled"), { status: 403 }));
    expect(await requestSignIn(null, fd({ email: "fallback@workos.test" }))).toMatchObject({ step: "code", via: "local" });
  });

  it("Google return: accepts only a signed, unexpired state from the same browser", async () => {
    const { googleSignInUrl, readOAuthState } = await import("@/lib/workos-headless");
    const { url, nonce } = await googleSignInUrl("/start");
    const state = new URL(url).searchParams.get("state")!;
    expect(readOAuthState(state, nonce)).toEqual({ next: "/start" });
    expect(readOAuthState(state, "other-browser")).toBeNull();
    expect(readOAuthState(`${state.split(".")[0]}.forged`, nonce)).toBeNull();
    expect(readOAuthState(state, undefined)).toBeNull();
    const evil = await googleSignInUrl("https://evil.test");
    expect(readOAuthState(new URL(evil.url).searchParams.get("state")!, evil.nonce)).toEqual({ next: "/studio" });
  });
});

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}
