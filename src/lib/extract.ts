import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_TEXT = 40_000;

function isPrivateAddress(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const p = v4.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Founder-supplied URLs are fetched server-side, so refuse anything that
 * resolves to a private, loopback or link-local address (SSRF guard).
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Unsupported protocol ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Refusing to fetch a local address");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Refusing to fetch a private network address");
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const text = main
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((l) => decodeEntities(l).trim())
    .filter(Boolean)
    .join("\n");
  return { title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() : null, text: text.slice(0, MAX_TEXT) };
}

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+/g, " ").trim().slice(0, MAX_TEXT);
}

export async function bytesToText(bytes: Uint8Array, contentType: string, filename?: string | null): Promise<string | null> {
  const name = filename?.toLowerCase() ?? "";
  if (contentType.includes("pdf") || name.endsWith(".pdf")) return pdfToText(bytes);
  if (contentType.includes("html") || name.endsWith(".html")) return htmlToText(new TextDecoder().decode(bytes)).text;
  if (contentType.startsWith("text/") || /\.(md|txt|csv|json)$/.test(name)) return new TextDecoder().decode(bytes).slice(0, MAX_TEXT);
  return null;
}

/** Direct fetch + extraction, used when Monid extraction is not configured. */
export async function fetchPage(raw: string): Promise<{ title: string | null; text: string; status: number }> {
  const url = await assertPublicUrl(raw);
  const res = await fetch(url, {
    headers: { "user-agent": "FounderDeskResearch/1.0 (+source verification)", accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) return { title: null, text: "", status: res.status };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (type.includes("pdf")) return { title: null, text: await pdfToText(bytes), status: res.status };
  const html = new TextDecoder().decode(bytes);
  return { ...(type.includes("html") || /<html/i.test(html) ? htmlToText(html) : { title: null, text: html.slice(0, MAX_TEXT) }), status: res.status };
}

/** Split text into sentences, keeping numbers like 3.5 intact. */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}
