import { env } from "@/lib/env";
import { requestJson } from "@/lib/integrations/http";

/**
 * Optional announcement destinations. Each adapter posts the approved
 * announcement and then reads the post back by its ID — a 2xx on create is not
 * treated as proof the post exists.
 *
 * Posting to third-party networks is not idempotent, so the caller records a
 * "publishing" row before calling post(); if a retry finds that row without an
 * external ID, it stops and asks for a human check instead of double-posting.
 */

export type SocialDestination = "x" | "linkedin";

export type PostResult = { externalId: string; url: string };

export type Adapter = {
  id: SocialDestination;
  label: string;
  maxLength: number;
  connected(): boolean;
  /** Post `text`; `thread` continues as replies where the network supports it. */
  post(text: string, thread?: string[]): Promise<PostResult>;
  verify(externalId: string): Promise<{ ok: boolean; detail: string }>;
};

const x: Adapter = {
  id: "x",
  label: "X",
  maxLength: 280,
  connected: () => Boolean(env().X_USER_ACCESS_TOKEN),
  async post(text, thread = []) {
    const send = (body: Record<string, unknown>) =>
      requestJson<{ data: { id: string } }>("x", "https://api.x.com/2/tweets", { token: env().X_USER_ACCESS_TOKEN, body });
    const first = (await send({ text })).data.data.id;
    let parent = first;
    for (const t of thread) parent = (await send({ text: t, reply: { in_reply_to_tweet_id: parent } })).data.data.id;
    return { externalId: first, url: `https://x.com/i/web/status/${first}` };
  },
  async verify(id) {
    const { data } = await requestJson<{ data?: { id: string; text: string } }>("x", `https://api.x.com/2/tweets/${encodeURIComponent(id)}`, {
      token: env().X_USER_ACCESS_TOKEN,
    });
    return data.data?.id === id ? { ok: true, detail: "Post read back by ID" } : { ok: false, detail: "Post not found on read-back" };
  },
};

const LINKEDIN_VERSION = "202510";

const linkedin: Adapter = {
  id: "linkedin",
  label: "LinkedIn",
  maxLength: 3000,
  connected: () => Boolean(env().LINKEDIN_ACCESS_TOKEN && env().LINKEDIN_AUTHOR_URN),
  async post(text, thread = []) {
    if (thread.length) text = [text, ...thread].join("\n\n");
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env().LINKEDIN_ACCESS_TOKEN}`,
        "content-type": "application/json",
        "linkedin-version": LINKEDIN_VERSION,
        "x-restli-protocol-version": "2.0.0",
      },
      body: JSON.stringify({
        author: env().LINKEDIN_AUTHOR_URN,
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
  async verify(urn) {
    const res = await fetch(`https://api.linkedin.com/rest/posts/${encodeURIComponent(urn)}`, {
      headers: { authorization: `Bearer ${env().LINKEDIN_ACCESS_TOKEN}`, "linkedin-version": LINKEDIN_VERSION, "x-restli-protocol-version": "2.0.0" },
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok ? { ok: true, detail: "Post read back by URN" } : { ok: false, detail: `Read-back HTTP ${res.status}` };
  },
};

export const SOCIAL: Record<SocialDestination, Adapter> = { x, linkedin };

export function connectedSocial(): Adapter[] {
  return Object.values(SOCIAL).filter((a) => a.connected());
}

export function renderAnnouncement(template: string, url: string, maxLength: number): string {
  const filled = template.includes("{{url}}") ? template.replace("{{url}}", url) : `${template} ${url}`;
  if (filled.length <= maxLength) return filled;
  const room = maxLength - url.length - 2;
  return `${template.replace("{{url}}", "").trim().slice(0, Math.max(0, room - 1)).trimEnd()}… ${url}`;
}
