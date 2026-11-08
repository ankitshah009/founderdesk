import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, googleConfigured, googleSimulated, googleStart, safeNext } from "@/lib/auth-google";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  if (!googleConfigured()) {
    if (googleSimulated()) return NextResponse.redirect(new URL(`/auth/google-sim?next=${encodeURIComponent(next)}`, req.url), 303);
    return NextResponse.redirect(new URL("/signin?google=unavailable", req.url), 303);
  }
  const { url, state } = googleStart(next);
  (await cookies()).set(GOOGLE_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return NextResponse.redirect(url, 303);
}
