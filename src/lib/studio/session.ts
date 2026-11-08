import "server-only";
import { currentSession } from "@/lib/auth";
import { env } from "@/lib/env";

/** The Studio is the signed-in founder's workspace; every query is scoped to their email. */
export async function studioSession(): Promise<{ email: string } | null> {
  const s = await currentSession();
  return s ? { email: s.email } : null;
}

export async function requireStudio(): Promise<{ email: string }> {
  const s = await studioSession();
  if (!s) throw new StudioAuthError("Sign in to use the Studio.");
  return s;
}

export class StudioAuthError extends Error {}

export const DEMO_EMAIL = "demo@founderdesk.dev";

/** The one-click demo workspace: always in development, opt-in elsewhere. */
export function demoEnabled(): boolean {
  return env().NODE_ENV !== "production" || env().DEMO_WORKSPACE === "true";
}
