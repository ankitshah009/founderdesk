import type { PostPlatform } from "@/lib/db/schema";

/**
 * Pure helpers for the "Capture post" bookmarklet and the capture page.
 * No server or browser dependencies, so they're safe to import anywhere.
 */

const PLATFORM_FROM_HOST: Array<[RegExp, PostPlatform]> = [
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(substack\.com|beehiiv\.com|buttondown\.email)$/, "newsletter"],
  [/(^|\.)(medium\.com|ghost\.io|wordpress\.com|hashnode\.dev)$/, "blog"],
];

export function platformFromUrl(url: string | null | undefined): PostPlatform | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLATFORM_FROM_HOST.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

const X_RESERVED = new Set(["i", "home", "search", "explore", "notifications", "messages", "settings", "hashtag", "intent", "share"]);

/** Best guess at the creator's handle from a post URL (x.com/<handle>/status/…, linkedin.com/in/<handle>, linkedin.com/posts/<handle>_…). */
export function guessAuthor(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)(x|twitter)\.com$/.test(host)) {
    const h = parts[0];
    return h && !X_RESERVED.has(h.toLowerCase()) && /^\w{1,15}$/.test(h) ? `@${h}` : null;
  }
  if (/(^|\.)linkedin\.com$/.test(host)) {
    if ((parts[0] === "in" || parts[0] === "company") && parts[1]) return `@${decodeURIComponent(parts[1])}`;
    if (parts[0] === "posts" && parts[1]) {
      const h = decodeURIComponent(parts[1]).split("_")[0];
      return h ? `@${h}` : null;
    }
    return null;
  }
  if (/(^|\.)(instagram|tiktok)\.com$/.test(host)) {
    const h = parts[0]?.replace(/^@/, "");
    return h && !["p", "reel", "explore", "video"].includes(h) ? `@${h}` : null;
  }
  return null;
}

/** "me" for the founder; otherwise a creator handle, always with a leading "@" when it's a single token. */
export function normalizeAuthor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v.toLowerCase() === "me" || v.toLowerCase() === "@me") return "me";
  if (/\s/.test(v)) return v.slice(0, 80);
  return `@${v.replace(/^@+/, "")}`.slice(0, 80);
}

/** The bookmarklet's source. `origin` is the app's own origin, embedded at render time. */
export function captureScript(origin: string): string {
  const body = `(function(){var o=${JSON.stringify(origin.replace(/\/$/, ""))};var s=String(window.getSelection?window.getSelection():"").trim();var m=document.querySelector('meta[property="og:description"]')||document.querySelector('meta[name="description"]');var t=s||(m&&m.getAttribute("content"))||document.title||"";var h=location.hostname.toLowerCase();var p=/(^|\\.)(x|twitter)\\.com$/.test(h)?"x":/(^|\\.)linkedin\\.com$/.test(h)?"linkedin":/(^|\\.)instagram\\.com$/.test(h)?"instagram":/(^|\\.)tiktok\\.com$/.test(h)?"tiktok":/substack\\.com$|beehiiv\\.com$/.test(h)?"newsletter":"other";window.open(o+"/studio/ideas/capture?url="+encodeURIComponent(location.href)+"&text="+encodeURIComponent(t.slice(0,1800))+"&platform="+p,"_blank");})();`;
  return `javascript:${encodeURIComponent(body)}`;
}

/** The next Tuesday strictly after `from`, as YYYY-MM-DD (UTC). */
export function nextTuesday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const add = (2 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

export const PLATFORM_LABEL: Record<PostPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  newsletter: "Newsletter",
  blog: "Blog",
  other: "Other",
};
export const POST_PLATFORM_LIST = Object.keys(PLATFORM_LABEL) as PostPlatform[];

export const CSV_HEADER = "text,author,platform,url,date,likes,comments,shares,impressions,followers";
