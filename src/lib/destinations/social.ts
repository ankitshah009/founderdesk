import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { requestJson } from "@/lib/integrations/http";

/**
 * Optional announcement destinations. Each adapter posts the approved
 * announcement with the credentials it is given (the founder's own connected
 * account, or the operator's env token) and then reads the post back by its ID
 * — a 2xx on create is not treated as proof the post exists.
 *
 * Posting to third-party networks is not idempotent, so the caller records a
 * "publishing" row before calling post(); if a retry finds that row without an
 * external ID, it stops and asks for a human check instead of double-posting.
 *
 * Simulated accounts never touch the network: see simulatedPost().
 */

export type SocialDestination = "x" | "linkedin";
export type SocialNetwork = SocialDestination | "instagram";

export type PostResult = { externalId: string; url: string };

/** Who a post goes out as. `externalUserId` is the LinkedIn author URN / Instagram user id. */
export type SocialCredentials = {
  provider: SocialNetwork;
  source: "founder" | "env";
  simulated: boolean;
  accessToken: string | null;
  externalUserId: string | null;
  handle: string | null;
  accountId?: string;
};

export type Adapter = {
  id: SocialDestination;
  label: string;
  maxLength: number;
  /** The operator's env-token account is configured. */
  connected(): boolean;
  envCredentials(): SocialCredentials | null;
  /** Post `text`; `thread` continues as replies where the network supports it. */
  post(creds: SocialCredentials, text: string, thread?: string[]): Promise<PostResult>;
  verify(creds: SocialCredentials, externalId: string): Promise<{ ok: boolean; detail: string }>;
};

function token(creds: SocialCredentials): string {
  if (creds.simulated) throw new Error("Refusing to call the network for a simulated account");
  if (!creds.accessToken) throw new Error(`No access token for ${creds.provider}`);
  return creds.accessToken;
}

const x: Adapter = {
  id: "x",
  label: "X",
  maxLength: 280,
  connected: () => Boolean(env().X_USER_ACCESS_TOKEN),
  envCredentials: () => (env().X_USER_ACCESS_TOKEN ? { provider: "x", source: "env", simulated: false, accessToken: env().X_USER_ACCESS_TOKEN!, externalUserId: null, handle: null } : null),
  async post(creds, text, thread = []) {
    const t = token(creds);
    const send = (body: Record<string, unknown>) => requestJson<{ data: { id: string } }>("x", "https://api.x.com/2/tweets", { token: t, body });
    const first = (await send({ text })).data.data.id;
    let parent = first;
    for (const s of thread) parent = (await send({ text: s, reply: { in_reply_to_tweet_id: parent } })).data.data.id;
    return { externalId: first, url: `https://x.com/i/web/status/${first}` };
  },
  async verify(creds, id) {
    const { data } = await requestJson<{ data?: { id: string; text: string } }>("x", `https://api.x.com/2/tweets/${encodeURIComponent(id)}`, { token: token(creds) });
    return data.data?.id === id ? { ok: true, detail: "Post read back by ID" } : { ok: false, detail: "Post not found on read-back" };
  },
};

const LINKEDIN_VERSION = "202510";

const linkedin: Adapter = {
  id: "linkedin",
  label: "LinkedIn",
  maxLength: 3000,
  connected: () => Boolean(env().LINKEDIN_ACCESS_TOKEN && env().LINKEDIN_AUTHOR_URN),
  envCredentials: () =>
    env().LINKEDIN_ACCESS_TOKEN && env().LINKEDIN_AUTHOR_URN
      ? { provider: "linkedin", source: "env", simulated: false, accessToken: env().LINKEDIN_ACCESS_TOKEN!, externalUserId: env().LINKEDIN_AUTHOR_URN!, handle: null }
      : null,
  async post(creds, text, thread = []) {
    const t = token(creds);
    if (!creds.externalUserId) throw new Error("LinkedIn needs an author URN");
    if (thread.length) text = [text, ...thread].join("\n\n");
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json", "linkedin-version": LINKEDIN_VERSION, "x-restli-protocol-version": "2.0.0" },
      body: JSON.stringify({
        author: creds.externalUserId,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status !== 201) throw new Error(`LinkedIn HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const urn = res.headers.get("x-restli-id");
    if (!urn) throw new Error("LinkedIn did not return a post URN");
    return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}` };
  },
  async verify(creds, urn) {
    const res = await fetch(`https://api.linkedin.com/rest/posts/${encodeURIComponent(urn)}`, {
      headers: { authorization: `Bearer ${token(creds)}`, "linkedin-version": LINKEDIN_VERSION, "x-restli-protocol-version": "2.0.0" },
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok ? { ok: true, detail: "Post read back by URN" } : { ok: false, detail: `Read-back HTTP ${res.status}` };
  },
};

export const SOCIAL: Record<SocialDestination, Adapter> = { x, linkedin };

/** Operator (env-token) accounts that are configured. */
export function connectedSocial(): Adapter[] {
  return Object.values(SOCIAL).filter((a) => a.connected());
}

/* ── Instagram (Instagram API with Instagram Login, business/creator accounts) ── */

const IG = "https://graph.instagram.com/v21.0";

async function igContainerReady(id: string, t: string) {
  // Image containers are usually ready at once; give slower ones a few seconds.
  for (let i = 0; i < 10; i++) {
    const { data } = await requestJson<{ status_code?: string }>("instagram", `${IG}/${encodeURIComponent(id)}?fields=status_code&access_token=${encodeURIComponent(t)}`);
    if (!data.status_code || data.status_code === "FINISHED" || data.status_code === "PUBLISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") throw new Error(`Instagram media container ${data.status_code}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Instagram media container was not ready in time");
}

/** One image → single post; several → carousel (max 10). Image URLs must be public. */
export async function postInstagram(creds: SocialCredentials, imageUrls: string[], caption: string): Promise<PostResult> {
  const t = token(creds);
  const user = creds.externalUserId;
  if (!user) throw new Error("Instagram needs the account's user id");
  if (!imageUrls.length) throw new Error("Instagram needs at least one image");
  const create = (body: Record<string, unknown>) => requestJson<{ id: string }>("instagram", `${IG}/${encodeURIComponent(user)}/media`, { token: t, body });
  let containerId: string;
  if (imageUrls.length === 1) {
    containerId = (await create({ image_url: imageUrls[0], caption })).data.id;
  } else {
    const children: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const child = (await create({ image_url: url, is_carousel_item: true })).data.id;
      await igContainerReady(child, t);
      children.push(child);
    }
    containerId = (await create({ media_type: "CAROUSEL", children: children.join(","), caption })).data.id;
  }
  await igContainerReady(containerId, t);
  const mediaId = (await requestJson<{ id: string }>("instagram", `${IG}/${encodeURIComponent(user)}/media_publish`, { token: t, body: { creation_id: containerId } })).data.id;
  const { data } = await requestJson<{ permalink?: string }>("instagram", `${IG}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(t)}`);
  return { externalId: mediaId, url: data.permalink ?? `https://www.instagram.com/` };
}

export async function verifyInstagram(creds: SocialCredentials, mediaId: string): Promise<{ ok: boolean; detail: string }> {
  const { data } = await requestJson<{ id?: string; permalink?: string }>("instagram", `${IG}/${encodeURIComponent(mediaId)}?fields=id,permalink&access_token=${encodeURIComponent(token(creds))}`);
  return data.id === mediaId ? { ok: true, detail: "Post read back by media ID" } : { ok: false, detail: "Post not found on read-back" };
}

/* ── Simulated accounts: record, never post ────────────────────────────────── */

export const SIMULATED_DETAIL = "Simulated account — nothing was posted";

export function simulatedPost(provider: string, articleUrl: string): PostResult {
  return { externalId: `sim_${provider}_${randomUUID()}`, url: articleUrl };
}

export function renderAnnouncement(template: string, url: string, maxLength: number): string {
  const filled = template.includes("{{url}}") ? template.replace("{{url}}", url) : `${template} ${url}`;
  if (filled.length <= maxLength) return filled;
  const room = maxLength - url.length - 2;
  return `${template.replace("{{url}}", "").trim().slice(0, Math.max(0, room - 1)).trimEnd()}… ${url}`;
}
