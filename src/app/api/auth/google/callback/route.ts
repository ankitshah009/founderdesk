import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, googleIdentity, verifyGoogleState } from "@/lib/auth-google";
import { audit, createSession } from "@/lib/auth";
import { safeEqual } from "@/lib/security";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = verifyGoogleState(jar.get(GOOGLE_STATE_COOKIE)?.value);
  jar.delete(GOOGLE_STATE_COOKIE);
  const code = url.searchParams.get("code");
  const nonce = url.searchParams.get("state") ?? "";
  if (!state || !code || !safeEqual(nonce, state.n)) return NextResponse.redirect(new URL("/signin?google=failed", req.url), 303);
  try {
    const who = await googleIdentity(code, state.v);
    await createSession(who.email);
    await audit("signin.google", who.email);
    if (who.name) {
      const { getProfile, updateProfile } = await import("@/lib/studio/store");
      const p = await getProfile(who.email);
      if (!p.displayName) await updateProfile(who.email, { displayName: who.name });
    }
    return NextResponse.redirect(new URL(state.next, req.url), 303);
  } catch (err) {
    console.error("[founderdesk] Google sign-in failed", err);
    return NextResponse.redirect(new URL("/signin?google=failed", req.url), 303);
  }
}
