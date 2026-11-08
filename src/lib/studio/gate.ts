import { safeNext } from "@/lib/auth-google";
import type { Profile } from "@/lib/db/schema";
import { getProfile } from "./store";

/**
 * Signed-in founders finish onboarding before the desk writes for them, so
 * every article starts from their brand and voice. Signed-out visitors can
 * still start one from the landing page as a free hook.
 */
export function onboardingDone(p: Pick<Profile, "onboardedAt" | "brand">): boolean {
  return Boolean(p.onboardedAt && (p.brand?.name || p.brand?.description));
}

export async function needsOnboarding(email: string): Promise<boolean> {
  return !onboardingDone(await getProfile(email));
}

export function onboardingPath(next: string): string {
  return `/studio/onboarding?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Where to land after any sign-in (code, email link or Google). Order and
 * review links go straight through; the Studio and article start wait for
 * onboarding.
 */
export async function landingAfterSignIn(email: string, rawNext: string | null | undefined): Promise<string> {
  const dest = safeNext(rawNext);
  const gated = dest === "/studio" || dest.startsWith("/start") || dest.startsWith("/studio?");
  if (gated && (await needsOnboarding(email))) return onboardingPath(dest);
  return dest;
}
