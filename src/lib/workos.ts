import { env } from "@/lib/env";

/**
 * WorkOS AuthKit is the sign-in front door when it's configured: its hosted
 * page handles email codes, Google and enterprise SSO. FounderDesk keeps its
 * own session (auth_sessions) as the one source of truth, so the callback
 * creates that session and everything downstream (Studio, onboarding gate,
 * order links) works the same. Until the keys are set, the email-code sign-in
 * stays the only path and nothing WorkOS is loaded.
 */
export function workosEnabled(): boolean {
  const e = process.env;
  return Boolean(e.WORKOS_API_KEY && e.WORKOS_CLIENT_ID && (e.WORKOS_COOKIE_PASSWORD?.length ?? 0) >= 32);
}

export function workosRedirectUri(): string {
  return `${env().APP_URL.replace(/\/$/, "")}/auth/callback`;
}
