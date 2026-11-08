import { safeNext } from "@/lib/auth-google";
import type { Profile } from "@/lib/db/schema";
import { getProfile } from "./store";

/**
 * Onboarding is optional: new founders see it first after signing in (it makes
 * drafts sound like them), but they can share as much or as little as they
 * like, or skip it. Nothing is blocked on it.
 */
export function onboardingDone(p: Pick<Profile, "onboardedAt" | "brand">): boolean {
  return Boolean(p.onboardedAt || p.brand?.name || p.brand?.description);
}

export async function needsOnboarding(email: string): Promise<boolean> {
  return !onboardingDone(await getProfile(email));
}

export function onboardingPath(next: string): string {
  return `/studio/onboarding?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Where to land after any sign-in (code, email link or Google). New founders
 * see onboarding first (skippable); order and review links go straight through.
 */
export async function landingAfterSignIn(email: string, rawNext: string | null | undefined): Promise<string> {
  const dest = safeNext(rawNext);
  const gated = dest === "/studio" || dest.startsWith("/start") || dest.startsWith("/studio?");
  if (gated && (await needsOnboarding(email))) return onboardingPath(dest);
  return dest;
}
