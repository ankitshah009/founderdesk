import { createHmac, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { requestJson } from "@/lib/integrations/http";

/**
 * CMS destinations: the approved article is cross-posted to the founder's own
 * blog after the web article is live, with an attribution link back to the
 * canonical FounderDesk URL. Like social posts, creating a CMS post is not
 * idempotent: the caller writes a `publishing` row first and every post is read
 * back by its id before it counts.
 *
 * Connected = env present. In development with no env, each CMS is offered as
 * a clearly-labelled simulated destination that records without network.
 */

export type CmsDestination = "wordpress" | "ghost" | "webflow";
export const CMS_DESTINATIONS: CmsDestination[] = ["wordpress", "ghost", "webflow"];

export type CmsArticle = { title: string; dek: string; html: string; slug: string; canonicalUrl: string };
export type CmsPostResult = { externalId: string; url: string | null };

export type CmsAdapter = {
  id: CmsDestination;
  label: string;
  envVars: string[];
  configured(): boolean;
  publish(article: CmsArticle): Promise<CmsPostResult>;
  verify(externalId: string): Promise<{ ok: boolean; detail: string }>;
};

export function isCms(d: string): d is CmsDestination {
  return (CMS_DESTINATIONS as string[]).includes(d);
}

const trim = (u: string) => u.replace(/\/+$/, "");

/* ── WordPress (REST API + application password) ───────────────────────────── */

const wpAuth = () => `Basic ${Buffer.from(`${env().WORDPRESS_USER}:${(env().WORDPRESS_APP_PASSWORD ?? "").replace(/\s+/g, "")}`).toString("base64")}`;

const wordpress: CmsAdapter = {
  id: "wordpress",
  label: "WordPress",
  envVars: ["WORDPRESS_URL", "WORDPRESS_USER", "WORDPRESS_APP_PASSWORD"],
  configured: () => Boolean(env().WORDPRESS_URL && env().WORDPRESS_USER && env().WORDPRESS_APP_PASSWORD),
  async publish(a) {
    const { data } = await requestJson<{ id: number; link?: string }>("wordpress", `${trim(env().WORDPRESS_URL!)}/wp-json/wp/v2/posts`, {
      headers: { authorization: wpAuth() },
      body: { title: a.title, content: a.html, excerpt: a.dek, slug: a.slug, status: "publish" },
    });
    if (!data.id) throw new Error("WordPress did not return a post id");
    return { externalId: String(data.id), url: data.link ?? null };
  },
  async verify(id) {
    const { data } = await requestJson<{ id?: number; status?: string }>("wordpress", `${trim(env().WORDPRESS_URL!)}/wp-json/wp/v2/posts/${encodeURIComponent(id)}?context=edit`, {
      headers: { authorization: wpAuth() },
    });
    return String(data.id) === id && data.status === "publish" ? { ok: true, detail: "Post read back by id (status publish)" } : { ok: false, detail: `Read-back status ${data.status ?? "missing"}` };
  },
};

/* ── Ghost Admin API ────────────────────────────────────────────────────────── */

/** Ghost Admin API token: HS256 JWT signed with the hex secret half of `id:secret`, aud /admin/, 5-minute expiry. */
export function ghostJwt(adminKey: string, nowMs = Date.now()): string {
  const [id, secret] = adminKey.split(":");
  if (!id || !secret || !/^[0-9a-f]+$/i.test(secret)) throw new Error("GHOST_ADMIN_KEY must look like <id>:<hex secret>");
  const iat = Math.floor(nowMs / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "HS256", typ: "JWT", kid: id });
  const body = enc({ iat, exp: iat + 300, aud: "/admin/" });
  const sig = createHmac("sha256", Buffer.from(secret, "hex")).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const ghostHeaders = () => ({ authorization: `Ghost ${ghostJwt(env().GHOST_ADMIN_KEY!)}`, "accept-version": "v5.0" });

const ghost: CmsAdapter = {
  id: "ghost",
  label: "Ghost",
  envVars: ["GHOST_ADMIN_URL", "GHOST_ADMIN_KEY"],
  configured: () => Boolean(env().GHOST_ADMIN_URL && env().GHOST_ADMIN_KEY),
  async publish(a) {
    const { data } = await requestJson<{ posts?: Array<{ id: string; url?: string }> }>("ghost", `${trim(env().GHOST_ADMIN_URL!)}/ghost/api/admin/posts/?source=html`, {
      headers: ghostHeaders(),
      body: { posts: [{ title: a.title, html: a.html, status: "published", canonical_url: a.canonicalUrl, custom_excerpt: a.dek.slice(0, 300), slug: a.slug }] },
    });
    const post = data.posts?.[0];
    if (!post?.id) throw new Error("Ghost did not return a post id");
    return { externalId: post.id, url: post.url ?? null };
  },
  async verify(id) {
    const { data } = await requestJson<{ posts?: Array<{ id: string; status?: string }> }>("ghost", `${trim(env().GHOST_ADMIN_URL!)}/ghost/api/admin/posts/${encodeURIComponent(id)}/`, { headers: ghostHeaders() });
    const p = data.posts?.[0];
    return p?.id === id && p.status === "published" ? { ok: true, detail: "Post read back by id (status published)" } : { ok: false, detail: `Read-back status ${p?.status ?? "missing"}` };
  },
};

/* ── Webflow CMS (Data API v2) ──────────────────────────────────────────────── */

const webflow: CmsAdapter = {
  id: "webflow",
  label: "Webflow",
  envVars: ["WEBFLOW_TOKEN", "WEBFLOW_COLLECTION_ID"],
  configured: () => Boolean(env().WEBFLOW_TOKEN && env().WEBFLOW_COLLECTION_ID),
  async publish(a) {
    const { data } = await requestJson<{ id?: string; items?: Array<{ id: string }> }>("webflow", `https://api.webflow.com/v2/collections/${encodeURIComponent(env().WEBFLOW_COLLECTION_ID!)}/items/live`, {
      token: env().WEBFLOW_TOKEN,
      body: { isArchived: false, isDraft: false, fieldData: { name: a.title, slug: a.slug, "post-body": a.html } },
    });
    const id = data.id ?? data.items?.[0]?.id;
    if (!id) throw new Error("Webflow did not return an item id");
    // Webflow's API does not return the public page URL (it depends on the site's collection template).
    return { externalId: id, url: null };
  },
  async verify(id) {
    const { data } = await requestJson<{ id?: string; isDraft?: boolean; isArchived?: boolean }>(
      "webflow",
      `https://api.webflow.com/v2/collections/${encodeURIComponent(env().WEBFLOW_COLLECTION_ID!)}/items/${encodeURIComponent(id)}`,
      { token: env().WEBFLOW_TOKEN },
    );
    return data.id === id && !data.isDraft && !data.isArchived ? { ok: true, detail: "Item read back by id" } : { ok: false, detail: "Item missing, draft or archived on read-back" };
  },
};

export const CMS: Record<CmsDestination, CmsAdapter> = { wordpress, ghost, webflow };

/** Simulated CMS destinations are offered only outside production, and only when the real one isn't configured. */
export function cmsSimulated(id: CmsDestination): boolean {
  return !CMS[id].configured() && env().NODE_ENV !== "production";
}

export function availableCms(): Array<{ id: CmsDestination; label: string; simulated: boolean }> {
  return CMS_DESTINATIONS.filter((id) => CMS[id].configured() || cmsSimulated(id)).map((id) => ({ id, label: CMS[id].label, simulated: !CMS[id].configured() }));
}

export const CMS_SIMULATED_DETAIL = "Simulated destination — nothing was published";

export function simulatedCmsPost(id: CmsDestination, articleUrl: string): CmsPostResult {
  return { externalId: `sim_${id}_${randomUUID()}`, url: articleUrl };
}

/* ── Markdown → static HTML ────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Inline rules mirror src/components/markdown.tsx: **bold**, _italic_, [links](https://…), [S1] citations. */
function inline(text: string, articleUrl: string): string {
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\[(S\d+)\])/g;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out += `<strong>${esc(tok.slice(2, -2))}</strong>`;
    else if (tok.startsWith("_")) out += `<em>${esc(tok.slice(1, -1))}</em>`;
    else if (m[3]) out += `<sup><a href="${esc(`${articleUrl}#source-${m[3]}`)}">${m[3]}</a></sup>`;
    else out += `<a href="${esc(m[2]!)}" rel="noopener noreferrer nofollow">${esc(tok.slice(1, tok.indexOf("](")))}</a>`;
    last = m.index! + tok.length;
  }
  return out + esc(text.slice(last));
}

export function markdownToHtml(md: string, articleUrl: string): string {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((b) => {
      if (b.startsWith("### ")) return `<h3>${inline(b.slice(4), articleUrl)}</h3>`;
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3), articleUrl)}</h2>`;
      if (b.startsWith("# ")) return `<h2>${inline(b.slice(2), articleUrl)}</h2>`;
      const lines = b.split("\n");
      if (lines.every((l) => /^[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2), articleUrl)}</li>`).join("")}</ul>`;
      if (lines.every((l) => l.startsWith(">"))) return `<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), articleUrl)}</p></blockquote>`;
      return `<p>${inline(lines.join(" "), articleUrl)}</p>`;
    })
    .join("\n");
}

/** Static article HTML for a CMS, with an attribution link to the canonical article. */
export function articleHtml(draft: { dek: string; bodyMarkdown: string }, articleUrl: string): string {
  return [
    `<link rel="canonical" href="${esc(articleUrl)}">`,
    draft.dek ? `<p><em>${esc(draft.dek)}</em></p>` : "",
    markdownToHtml(draft.bodyMarkdown, articleUrl),
    `<p><small>Originally published at <a href="${esc(articleUrl)}" rel="canonical">${esc(articleUrl)}</a>.</small></p>`,
  ]
    .filter(Boolean)
    .join("\n");
}
