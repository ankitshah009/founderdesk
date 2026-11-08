import type { Brand, KnowledgeKind } from "@/lib/db/schema";
import { decodeEntities, htmlToText } from "@/lib/extract";
import { sentencesOf, wordsOf } from "./text";

/**
 * Brand capture for onboarding: read a company website, a PDF (deck, one-pager,
 * brand book) or pasted text, and pull out what the desk needs to write as
 * this company — name, tagline, description, products, audience, key terms,
 * colours and logo. Everything captured is shown to the founder to confirm;
 * nothing is invented when a page doesn't say it.
 */

const STOP = new Set(
  "about above after again against also although among because been before being below between both cannot could does doing during each even every from further have having here into itself just more most much must only other over same should since some such than that their them then there these they this those through under until very were what when where which while with within without would your yours ours ourselves the and for are was not you our can will how why who get make makes made use using used more learn read today free sign login started start contact privacy terms cookies policy rights reserved copyright".split(" "),
);

export type Capture = {
  brand: Omit<Brand, "capturedAt" | "sources">;
  knowledge: Array<{ kind: KnowledgeKind; title: string; content: string; url?: string | null; pinned?: boolean }>;
  /** Plain copy for the voice analyser. */
  copy: string;
};

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() || null : null;
}

function absolute(href: string | null | undefined, base: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base ?? undefined).toString();
  } catch {
    return null;
  }
}

const isGrey = (hex: string) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  if ([r, g, b].some((x) => Number.isNaN(x))) return true;
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 18;
};

/** Brand colours: theme-color first, then the most used non-grey hex colours in the page's CSS. */
export function brandColors(html: string): string[] {
  const out: string[] = [];
  const theme = meta(html, "theme-color");
  if (theme && /^#[0-9a-f]{3,8}$/i.test(theme) && !isGrey(theme)) out.push(theme.toLowerCase());
  const counts = new Map<string, number>();
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") + [...html.matchAll(/style=["']([^"']*)["']/gi)].map((m) => m[1]).join("\n");
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = `#${m[1]!.toLowerCase()}`;
    if (isGrey(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const [hex] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (!out.includes(hex)) out.push(hex);
    if (out.length >= 4) break;
  }
  return out;
}

export function keyTerms(text: string, exclude: string[] = []): string[] {
  const words = wordsOf(text).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
  const ex = new Set(exclude.flatMap((e) => wordsOf(e)));
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!ex.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const next = words[i + 1];
    if (next && !ex.has(w) && !ex.has(next)) counts.set(`${w} ${next}`, (counts.get(`${w} ${next}`) ?? 0) + 1.5);
  }
  const ranked = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const out: string[] = [];
  for (const [term] of ranked) {
    if (out.some((t) => t.includes(term) || term.includes(t))) continue;
    out.push(term);
    if (out.length >= 10) break;
  }
  return out;
}

const AUDIENCE_RE = /\b(?:built|made|designed)?\s*for\s+((?:early-stage |growing |modern |small |busy |b2b |saas |enterprise )*(?:startups?|founders?|teams?|developers?|engineers?|marketers?|companies|businesses|creators?|agencies|sales teams?|product teams?|operators?|clinics?|restaurants?|lawyers?|accountants?|investors?))\b/i;

function audienceOf(text: string): string | null {
  const m = text.match(AUDIENCE_RE);
  return m ? m[1]!.trim().replace(/^\w/, (c) => c.toUpperCase()) : null;
}

export function brandFromHtml(html: string, url: string | null): Capture {
  const { title, text } = htmlToText(html);
  const siteName = meta(html, "og:site_name") ?? meta(html, "application-name");
  const titleParts = (title ?? "").split(/\s+[|–—:-]\s+/).map((s) => s.trim()).filter(Boolean);
  const name = siteName ?? (titleParts.length > 1 ? titleParts.reduce((a, b) => (a.length <= b.length ? a : b)) : titleParts[0] ?? null);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const h1Text = h1 ? decodeEntities(h1.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;
  const description = meta(html, "og:description") ?? meta(html, "description") ?? meta(html, "twitter:description");
  const tagline = h1Text && h1Text.split(" ").length <= 16 ? h1Text : description?.split(/(?<=[.!?])\s/)[0] ?? null;
  const logoTag = html.match(/<img[^>]+(?:class|alt|src|id)=["'][^"']*logo[^"']*["'][^>]*>/i)?.[0];
  const logoSrc = logoTag?.match(/src=["']([^"']+)["']/i)?.[1];
  const icon = html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  const logoUrl = absolute(logoSrc, url) ?? absolute(icon, url) ?? absolute(meta(html, "og:image"), url);
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((m) => decodeEntities(m[1]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((h) => h.split(" ").length >= 2 && h.split(" ").length <= 10 && !/cookie|newsletter|subscribe|contact|faq|pricing|footer|blog|careers/i.test(h));
  const products = [...new Set(headings)].slice(0, 6);
  const fromText = brandFromText(text, url ?? "website");
  return {
    brand: {
      name,
      tagline,
      description: description ?? fromText.brand.description,
      website: url,
      logoUrl,
      colors: brandColors(html),
      audience: audienceOf(`${description ?? ""} ${h1Text ?? ""} ${text.slice(0, 3000)}`),
      products: products.length ? products : fromText.brand.products,
      keywords: keyTerms(text, name ? [name] : []),
    },
    knowledge: [
      ...(description || h1Text
        ? [{ kind: "company" as const, title: `About ${name ?? "the company"}`, content: [h1Text, description, fromText.brand.description].filter(Boolean).join("\n\n"), url, pinned: true }]
        : []),
      ...products.map((p) => ({ kind: "product" as const, title: p, content: sectionAfter(html, p) ?? p, url })),
    ],
    copy: text,
  };
}

/** The text of the section under a heading, for product knowledge items. */
function sectionAfter(html: string, heading: string): string | null {
  const at = html.indexOf(heading);
  if (at < 0) return null;
  const chunk = html.slice(at, at + 2500).split(/<h[1-3][^>]*>/i)[0] ?? "";
  const text = decodeEntities(chunk.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > heading.length + 20 ? text.slice(0, 800) : null;
}

export function brandFromText(raw: string, source: string): Capture {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const capitalised = [...text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)?(?:\s[A-Z][a-z]+)?)\b/g)].map((m) => m[1]!);
  const counts = new Map<string, number>();
  for (const c of capitalised) if (!/^(The|This|That|We|Our|You|Your|It|In|For|And|But|With|At|On|A|An|If|When|What|How|Why)$/.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const name = first.split(" ").length <= 4 && /^[A-Z]/.test(first) && !/[.!?]$/.test(first) ? first : frequent && frequent[1] >= 3 ? frequent[0] : null;
  const sents = sentencesOf(lines.slice(name === first ? 1 : 0).join(" "));
  const tagline = sents.find((s) => s.split(" ").length <= 18) ?? null;
  const description = sents.slice(0, 3).join(" ") || null;
  const bullets = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""));
  const shortTitled = lines.filter((l) => l.split(" ").length >= 2 && l.split(" ").length <= 7 && /^[A-Z]/.test(l) && !/[.:]$/.test(l) && l !== name);
  const products = [...new Set((bullets.length >= 2 ? bullets : shortTitled).filter((p) => p.length <= 90))].slice(0, 6);
  return {
    brand: { name, tagline, description, website: null, logoUrl: null, colors: [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((c) => c.toLowerCase()))].filter((c) => !isGrey(c)).slice(0, 4), audience: audienceOf(text), products, keywords: keyTerms(text, name ? [name] : []) },
    knowledge: description ? [{ kind: "company", title: `About ${name ?? "the company"} (from ${source})`, content: text.slice(0, 6000), pinned: true }] : [],
    copy: text,
  };
}

/** Combine captures from several inputs: earlier inputs win for single fields, lists are merged. */
export function mergeBrand(existing: Brand | null, add: Capture["brand"], source: string, now = new Date()): Brand {
  const pick = <T>(a: T | null | undefined, b: T | null | undefined) => (a != null && a !== "" ? a : (b ?? null));
  const uniq = (xs: string[], n: number) => [...new Set(xs.filter(Boolean))].slice(0, n);
  return {
    name: pick(existing?.name, add.name),
    tagline: pick(existing?.tagline, add.tagline),
    description: pick(existing?.description, add.description),
    website: pick(existing?.website, add.website),
    logoUrl: pick(existing?.logoUrl, add.logoUrl),
    colors: uniq([...(existing?.colors ?? []), ...add.colors], 5),
    audience: pick(existing?.audience, add.audience),
    products: uniq([...(existing?.products ?? []), ...add.products], 8),
    keywords: uniq([...(existing?.keywords ?? []), ...add.keywords], 12),
    sources: uniq([...(existing?.sources ?? []), source], 10),
    capturedAt: now.toISOString(),
  };
}
