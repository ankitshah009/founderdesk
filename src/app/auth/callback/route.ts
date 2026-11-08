import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { workosEnabled } from "@/lib/workos";

/**
 * WorkOS AuthKit callback. On success it opens a FounderDesk session for the
 * verified email, then /auth/after applies the usual landing rule.
 */
export async function GET(req: NextRequest) {
  if (!workosEnabled()) return NextResponse.redirect(new URL("/signin", req.url), 303);
  const { handleAuth } = await import("@workos-inc/authkit-nextjs");
  const handler = handleAuth({
    baseURL: env().APP_URL,
    returnPathname: "/auth/after",
    onSuccess: async ({ user }) => {
      // Our data is keyed by email, so only a verified address may open a session.
      if (!user.emailVerified) throw new Error("WorkOS email not verified");
      const { audit, createSession } = await import("@/lib/auth");
      const email = user.email.trim().toLowerCase();
      await createSession(email);
      await audit("signin.workos", email);
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      if (name) {
        const { getProfile, updateProfile } = await import("@/lib/studio/store");
        const p = await getProfile(email);
        if (!p.displayName) await updateProfile(email, { displayName: name });
      }
    },
    onError: ({ error }) => {
      console.error("[founderdesk] WorkOS sign-in failed", error);
      return NextResponse.redirect(new URL("/signin?workos=failed", env().APP_URL), 303);
    },
  });
  return handler(req);
}
