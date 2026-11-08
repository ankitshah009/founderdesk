import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { connectSimulated } from "@/lib/social/accounts";
import { STATE_COOKIE, STATE_TTL_MS, authorizeUrl, isProvider, newNonce, pkcePair, providerConfigured, signState } from "@/lib/social/oauth";
import { studioSession } from "@/lib/studio/session";

/** Start connecting a founder's social account. Requires a Studio session. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/start">) {
  const { provider } = await ctx.params;
  const back = new URL("/studio/connections", req.nextUrl);
  if (!isProvider(provider)) return new Response("Unknown provider", { status: 404 });
  const session = await studioSession();
  if (!session) return NextResponse.redirect(new URL("/studio", req.nextUrl));

  // No client credentials: a clearly-labelled simulated account, no network.
  if (!providerConfigured(provider)) {
    await connectSimulated(session.email, provider);
    back.search = new URLSearchParams({ connected: provider, simulated: "1" }).toString();
    return NextResponse.redirect(back);
  }

  const { verifier, challenge } = pkcePair();
  const nonce = newNonce();
  const res = NextResponse.redirect(authorizeUrl(provider, nonce, challenge));
  res.cookies.set(STATE_COOKIE(provider), signState({ p: provider, e: session.email, v: verifier, n: nonce }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/api/oauth",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
