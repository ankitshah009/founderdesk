import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-google";
import { workosEnabled, workosRedirectUri } from "@/lib/workos";

/**
 * Initiate-login URI for WorkOS AuthKit. `?next=` is where to go afterwards
 * (onboarding still comes first for new founders); `?mode=signup` opens the
 * sign-up screen. Falls back to the email-code page when WorkOS isn't set up.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const signup = url.searchParams.get("mode") === "signup";
  if (!workosEnabled()) redirect(`${signup ? "/signup" : "/signin"}?next=${encodeURIComponent(next)}`);
  const { getSignInUrl, getSignUpUrl } = await import("@workos-inc/authkit-nextjs");
  const opts = { redirectUri: workosRedirectUri(), returnTo: `/auth/after?next=${encodeURIComponent(next)}`, loginHint: url.searchParams.get("email") ?? undefined };
  redirect(signup ? await getSignUpUrl(opts) : await getSignInUrl(opts));
}
