import { describe, expect, it } from "vitest";
import { googleSimulated, safeNext, signGoogleState, verifyGoogleState } from "@/lib/auth-google";

describe("Google sign-in", () => {
  it("accepts only an untampered, unexpired state", () => {
    const now = Date.now();
    const s = signGoogleState({ v: "verifier", n: "nonce", next: "/studio" }, now);
    expect(verifyGoogleState(s, now)?.n).toBe("nonce");
    expect(verifyGoogleState(`${s}x`, now)).toBeNull();
    const [body, mac] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "v", n: "nonce", next: "/studio", exp: now + 1e9 })).toString("base64url");
    expect(verifyGoogleState(`${forged}.${mac}`, now)).toBeNull();
    expect(verifyGoogleState(`${body}.${mac}`, now + 11 * 60_000)).toBeNull();
    expect(verifyGoogleState(undefined)).toBeNull();
  });

  it("never redirects off-site after sign-in", () => {
    expect(safeNext("/studio/onboarding")).toBe("/studio/onboarding");
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/studio");
    expect(safeNext("//evil.example")).toBe("/studio");
    expect(safeNext("/studiox")).toBe("/studio");
  });

  it("offers the simulation only outside production", () => {
    expect(googleSimulated()).toBe(true); // tests run with NODE_ENV=test and no Google keys
  });
});
