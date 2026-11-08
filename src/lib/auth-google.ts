import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { appSecret, env } from "@/lib/env";
import { safeEqual } from "@/lib/security";

/**
 * "Continue with Google": OpenID Connect authorization code flow with PKCE.
 * Only a Google-verified email signs anyone in; the session is the same
 * server-side session the email link creates (see lib/auth.ts).
 *
 * Without GOOGLE_CLIENT_ID/SECRET, development offers a clearly labelled
 * simulated Google sign-in instead. It is never available in production.
 */

export const GOOGLE_STATE_COOKIE = "fd_google_oauth";
const TTL_MS = 10 * 60_000;

export const googleConfigured = () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
export const googleSimulated = () => !googleConfigured() && env().NODE_ENV !== "production";
export const googleAvailable = () => googleConfigured() || googleSimulated();
export const googleRedirectUri = () => `${env().APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;

type State = { v: string; n: string; next: string; exp: number };

const sign = (body: string) => createHmac("sha256", appSecret()).update(`google:${body}`).digest("base64url");

export function signGoogleState(s: Omit<State, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: now + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyGoogleState(token: string | undefined | null, now = Date.now()): State | null {
  const [body, mac] = (token ?? "").split(".");
  if (!body || !mac || !safeEqual(mac, sign(body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as State;
    return s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function safeNext(raw: string | null | undefined): string {
  return raw && /^\/(studio|account)(\/|$|\?)/.test(raw) ? raw : "/studio";
}

export function googleStart(next: string): { url: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const state = signGoogleState({ v: verifier, n: nonce, next: safeNext(next) });
  const q = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, state };
}

/** Exchange the code and return the verified Google identity. */
export async function googleIdentity(code: string, verifier: string): Promise<{ email: string; name: string | null }> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, redirect_uri: googleRedirectUri(), grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (HTTP ${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google returned no access token");
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15_000) });
  if (!infoRes.ok) throw new Error(`Google userinfo failed (HTTP ${infoRes.status})`);
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!info.email || info.email_verified !== true) throw new Error("Google didn't confirm this email address");
  return { email: info.email.toLowerCase(), name: info.name ?? null };
}
