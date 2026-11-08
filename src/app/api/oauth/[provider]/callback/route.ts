import { NextResponse, type NextRequest } from "next/server";
import { upsertAccount } from "@/lib/social/accounts";
import { STATE_COOKIE, exchangeCode, fetchProfile, isProvider, verifyState } from "@/lib/social/oauth";
import { studioSession } from "@/lib/studio/session";

/** Provider redirect back: verify the signed state, exchange the code, store tokens encrypted. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Unknown provider", { status: 404 });
  const q = req.nextUrl.searchParams;
  const done = (params: Record<string, string>) => {
    const url = new URL("/studio/connections", req.nextUrl);
    url.search = new URLSearchParams(params).toString();
    const res = NextResponse.redirect(url);
    res.cookies.set(STATE_COOKIE(provider), "", { path: "/api/oauth", maxAge: 0 });
    return res;
  };

  const state = verifyState(req.cookies.get(STATE_COOKIE(provider))?.value, provider);
  if (!state || q.get("state") !== state.n) return done({ error: "The sign-in link expired or was tampered with. Try connecting again." });
  const session = await studioSession();
  if (!session || session.email !== state.e) return done({ error: "Sign in to the Studio as the same founder, then connect again." });
  if (q.get("error")) return done({ error: `${provider} declined: ${q.get("error_description") ?? q.get("error")}`.slice(0, 200) });
  const code = q.get("code");
  if (!code) return done({ error: "The provider did not return an authorization code." });

  try {
    const tokens = await exchangeCode(provider, code, state.v);
    const profile = await fetchProfile(provider, tokens.accessToken);
    await upsertAccount(session.email, provider, profile, tokens);
  } catch (err) {
    console.error(`[oauth] ${provider} callback failed`, err);
    return done({ error: `Could not finish connecting ${provider}. Check the app's credentials and redirect URI.` });
  }
  return done({ connected: provider });
}
