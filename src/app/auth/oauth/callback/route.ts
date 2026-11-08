import { NextResponse, type NextRequest } from "next/server";
import { workosEnabled } from "@/lib/workos";

/** Return from Google (via WorkOS): verify state, open a FounderDesk session, apply the landing rule. */
export async function GET(req: NextRequest) {
  const fail = (why: string) => NextResponse.redirect(new URL(`/signin?workos=${why}`, req.url), 303);
  if (!workosEnabled()) return fail("failed");
  const { OAUTH_COOKIE, WorkOSSignInError, finishOAuth, readOAuthState } = await import("@/lib/workos-headless");
  const state = readOAuthState(req.nextUrl.searchParams.get("state"), req.cookies.get(OAUTH_COOKIE)?.value);
  const code = req.nextUrl.searchParams.get("code");
  if (!state || !code) return fail(req.nextUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
  try {
    const who = await finishOAuth(code, { ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(), userAgent: req.headers.get("user-agent") ?? undefined });
    const { audit, createSession } = await import("@/lib/auth");
    await createSession(who.email);
    await audit("signin.workos_google", who.email);
    if (who.name) {
      const { getProfile, updateProfile } = await import("@/lib/studio/store");
      const p = await getProfile(who.email);
      if (!p.displayName) await updateProfile(who.email, { displayName: who.name });
    }
    const { landingAfterSignIn } = await import("@/lib/studio/gate");
    const res = NextResponse.redirect(new URL(await landingAfterSignIn(who.email, state.next), req.url), 303);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth/oauth" });
    return res;
  } catch (err) {
    if (!(err instanceof WorkOSSignInError)) console.error("[founderdesk] Google sign-in failed", err);
    return fail("failed");
  }
}
