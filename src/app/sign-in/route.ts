import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-google";
import { workosEnabled, workosRedirectUri } from "@/lib/workos";

/**
 * Starts a WorkOS sign-in.
 *  - `?provider=google`: straight to Google's account picker (no WorkOS page).
 *  - otherwise: WorkOS's hosted page, kept for company SSO and as a fallback.
 * `?next=` is where to go afterwards (onboarding still comes first for new founders).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const signup = url.searchParams.get("mode") === "signup";
  if (!workosEnabled()) redirect(`${signup ? "/signup" : "/signin"}?next=${encodeURIComponent(next)}`);

  if (url.searchParams.get("provider") === "google") {
    const { OAUTH_COOKIE, googleSignInUrl } = await import("@/lib/workos-headless");
    const { url: to, nonce } = await googleSignInUrl(next);
    (await cookies()).set(OAUTH_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/auth/oauth", maxAge: 600 });
    redirect(to);
  }

  const { getSignInUrl, getSignUpUrl } = await import("@workos-inc/authkit-nextjs");
  const opts = { redirectUri: workosRedirectUri(), returnTo: `/auth/after?next=${encodeURIComponent(next)}`, loginHint: url.searchParams.get("email") ?? undefined };
  redirect(signup ? await getSignUpUrl(opts) : await getSignInUrl(opts));
}
