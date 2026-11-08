import { NextResponse, type NextRequest } from "next/server";
import { currentSession } from "@/lib/auth";
import { landingAfterSignIn } from "@/lib/studio/gate";

/** After an external sign-in: same landing rule as every other path (onboarding first). */
export async function GET(req: NextRequest) {
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL("/signin", req.url), 303);
  const dest = await landingAfterSignIn(session.email, req.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(dest, req.url), 303);
}
