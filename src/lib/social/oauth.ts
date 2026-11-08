import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/db/schema";
import { appSecret, env } from "@/lib/env";
import { ProviderError, requestJson } from "@/lib/integrations/http";

/**
 * OAuth for founder-owned social accounts. Each provider is either configured
 * (client credentials present → real OAuth) or not (the Connect button creates
 * a clearly-labelled simulated account and nothing touches the network).
 */

export const PROVIDER_LABEL: Record<SocialProvider, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

export function isProvider(p: string): p is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(p);
}

/** Env vars a provider needs before real OAuth is offered. */
export const PROVIDER_ENV: Record<SocialProvider, string[]> = {
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET (optional for public PKCE clients)"],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
};

export function providerConfigured(p: SocialProvider): boolean {
  const e = env();
  if (p === "x") return Boolean(e.X_CLIENT_ID);
  if (p === "linkedin") return Boolean(e.LINKEDIN_CLIENT_ID && e.LINKEDIN_CLIENT_SECRET);
  return Boolean(e.INSTAGRAM_APP_ID && e.INSTAGRAM_APP_SECRET);
}

export function redirectUri(p: SocialProvider): string {
  return `${env().APP_URL.replace(/\/$/, "")}/api/oauth/${p}/callback`;
}

export const STATE_COOKIE = (p: SocialProvider) => `fd_oauth_${p}`;
export const STATE_TTL_MS = 10 * 60_000;

/* ── Signed, expiring state ────────────────────────────────────────────────── */

export type OAuthState = { p: SocialProvider; e: string; v: string; n: string; exp: number };

const mac = (body: string) => createHmac("sha256", `founderdesk:oauth:${appSecret()}`).update(body).digest("base64url");

export function signState(s: Omit<OAuthState, "exp"> & { exp?: number }, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: s.exp ?? now + STATE_TTL_MS })).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the state only if the signature is intact, it is unexpired, and it is for this provider. */
export function verifyState(token: string | undefined | null, provider: SocialProvider, now = Date.now()): OAuthState | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let s: OAuthState;
  try {
    s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
  if (typeof s.exp !== "number" || s.exp < now) return null;
  if (s.p !== provider || !s.e || !s.n) return null;
  return s;
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function newNonce() {
  return randomBytes(16).toString("base64url");
}

/* ── Provider endpoints ────────────────────────────────────────────────────── */

const SCOPES: Record<SocialProvider, string> = {
  x: "tweet.read tweet.write users.read offline.access",
  linkedin: "openid profile w_member_social",
  instagram: "instagram_business_basic,instagram_business_content_publish",
};

export function authorizeUrl(p: SocialProvider, state: string, challenge: string): string {
  const e = env();
  if (p === "x") {
    const u = new URL("https://x.com/i/oauth2/authorize");
    u.search = new URLSearchParams({ response_type: "code", client_id: e.X_CLIENT_ID!, redirect_uri: redirectUri(p), scope: SCOPES.x, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return u.toString();
  }
  if (p === "linkedin") {
    const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
    u.search = new URLSearchParams({ response_type: "code", client_id: e.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri(p), scope: SCOPES.linkedin, state }).toString();
    return u.toString();
  }
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.search = new URLSearchParams({ response_type: "code", client_id: e.INSTAGRAM_APP_ID!, redirect_uri: redirectUri(p), scope: SCOPES.instagram, state }).toString();
  return u.toString();
}

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; scopes: string | null };
export type Profile = { externalUserId: string; handle: string };

async function postForm<T>(provider: string, url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...headers },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError(provider, 0, String(err), `${provider} request failed: ${String(err)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ProviderError(provider, res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(provider, res.status, text, `${provider} returned non-JSON`);
  }
}

type RawToken = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
const toTokenSet = (t: RawToken, fallbackRefresh: string | null = null): TokenSet => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? fallbackRefresh,
  expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
  scopes: t.scope ?? null,
});

function xAuthHeaders(): Record<string, string> {
  const e = env();
  return e.X_CLIENT_SECRET ? { authorization: `Basic ${Buffer.from(`${e.X_CLIENT_ID}:${e.X_CLIENT_SECRET}`).toString("base64")}` } : {};
}

export async function exchangeCode(p: SocialProvider, code: string, verifier: string): Promise<TokenSet> {
  const e = env();
  if (p === "x") {
    const t = await postForm<RawToken>("x", "https://api.x.com/2/oauth2/token", { grant_type: "authorization_code", code, redirect_uri: redirectUri(p), code_verifier: verifier, client_id: e.X_CLIENT_ID! }, xAuthHeaders());
    return toTokenSet(t);
  }
  if (p === "linkedin") {
    const t = await postForm<RawToken>("linkedin", "https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(p),
      client_id: e.LINKEDIN_CLIENT_ID!,
      client_secret: e.LINKEDIN_CLIENT_SECRET!,
    });
    return toTokenSet(t);
  }
  // Instagram: short-lived token (1h) → long-lived token (60 days, refreshable).
  const short = await postForm<{ access_token?: string; data?: Array<{ access_token: string; permissions?: string | string[] }>; permissions?: string | string[] }>(
    "instagram",
    "https://api.instagram.com/oauth/access_token",
    { client_id: e.INSTAGRAM_APP_ID!, client_secret: e.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: redirectUri(p), code },
  );
  const shortToken = short.access_token ?? short.data?.[0]?.access_token;
  if (!shortToken) throw new ProviderError("instagram", 200, JSON.stringify(short), "Instagram did not return an access token");
  const perms = short.permissions ?? short.data?.[0]?.permissions;
  const u = new URL("https://graph.instagram.com/access_token");
  u.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: e.INSTAGRAM_APP_SECRET!, access_token: shortToken }).toString();
  const { data } = await requestJson<RawToken>("instagram", u.toString());
  return { ...toTokenSet(data), refreshToken: null, scopes: Array.isArray(perms) ? perms.join(",") : (perms ?? SCOPES.instagram) };
}

export async function fetchProfile(p: SocialProvider, accessToken: string): Promise<Profile> {
  if (p === "x") {
    const { data } = await requestJson<{ data?: { id: string; username: string } }>("x", "https://api.x.com/2/users/me", { token: accessToken });
    if (!data.data?.id) throw new Error("X did not return the signed-in user");
    return { externalUserId: data.data.id, handle: `@${data.data.username}` };
  }
  if (p === "linkedin") {
    const { data } = await requestJson<{ sub?: string; name?: string }>("linkedin", "https://api.linkedin.com/v2/userinfo", { token: accessToken });
    if (!data.sub) throw new Error("LinkedIn did not return the signed-in member");
    return { externalUserId: `urn:li:person:${data.sub}`, handle: data.name || "LinkedIn member" };
  }
  const u = new URL("https://graph.instagram.com/me");
  u.search = new URLSearchParams({ fields: "user_id,username", access_token: accessToken }).toString();
  const { data } = await requestJson<{ id?: string; user_id?: string; username?: string }>("instagram", u.toString());
  const id = data.user_id ?? data.id;
  if (!id) throw new Error("Instagram did not return the account");
  return { externalUserId: String(id), handle: `@${data.username ?? id}` };
}

/** Refresh an expired (or nearly expired) token. Returns null when the provider gave no way to refresh. */
export async function refreshTokens(p: SocialProvider, current: { accessToken: string | null; refreshToken: string | null }): Promise<TokenSet | null> {
  const e = env();
  if (p === "x") {
    if (!current.refreshToken || !e.X_CLIENT_ID) return null;
    const t = await postForm<RawToken>("x", "https://api.x.com/2/oauth2/token", { grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: e.X_CLIENT_ID }, xAuthHeaders());
    return toTokenSet(t, current.refreshToken);
  }
  if (p === "linkedin") {
    // Refresh tokens are only issued to approved LinkedIn partners.
    if (!current.refreshToken || !e.LINKEDIN_CLIENT_ID || !e.LINKEDIN_CLIENT_SECRET) return null;
    const t = await postForm<RawToken>("linkedin", "https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: e.LINKEDIN_CLIENT_ID,
      client_secret: e.LINKEDIN_CLIENT_SECRET,
    });
    return toTokenSet(t, current.refreshToken);
  }
  // Instagram long-lived tokens refresh themselves (while still valid).
  if (!current.accessToken) return null;
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: current.accessToken }).toString();
  const { data } = await requestJson<RawToken>("instagram", u.toString());
  return { ...toTokenSet(data), refreshToken: null };
}
