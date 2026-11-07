import { env } from "@/lib/env";
import { requestJson } from "./http";

/**
 * Monid: one wallet, many data endpoints. The documented sequence is
 * discover → inspect → run. Search and extraction endpoints are chosen at
 * setup time (`pnpm setup:monid`) from what the account actually offers and
 * configured via env — we never assume a generic /search exists.
 *
 * Runs are sync (200, COMPLETED) or async (202, READY → poll). A COMPLETED run
 * is not evidence by itself: callers must check the provider-level result and
 * that useful content came back.
 */

function base() {
  const e = env();
  if (!e.MONID_API_KEY) throw new Error("MONID_API_KEY is not set");
  return { url: e.MONID_BASE_URL.replace(/\/$/, ""), token: e.MONID_API_KEY };
}

export type MonidRun = {
  runId: string;
  provider: string;
  endpoint: string;
  status: "READY" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "STOPPED" | "TIMED_OUT" | string;
  output?: unknown;
  providerResponse?: { httpStatus?: number; error?: unknown };
  reason?: string;
};

export const TERMINAL = new Set(["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"]);

export async function discover(query: string, limit = 8) {
  const { url, token } = base();
  const { data } = await requestJson<{
    results: Array<{ provider: string; providerName?: string; endpoint: string; description: string; score: number; price?: unknown }>;
  }>("monid", `${url}/discover`, { token, body: { query, limit } });
  return data.results;
}

export async function inspect(provider: string, endpoint: string) {
  const { url, token } = base();
  const { data } = await requestJson<Record<string, unknown>>("monid", `${url}/inspect`, { token, body: { provider, endpoint } });
  return data;
}

export async function run(provider: string, endpoint: string, input: Record<string, unknown>): Promise<MonidRun> {
  const { url, token } = base();
  const { data } = await requestJson<MonidRun>("monid", `${url}/run`, { token, body: { provider, endpoint, input }, timeoutMs: 60_000 });
  return data;
}

export async function getRun(runId: string): Promise<MonidRun> {
  const { url, token } = base();
  const { data } = await requestJson<MonidRun>("monid", `${url}/runs/${encodeURIComponent(runId)}`, { token });
  return data;
}

/** Fill a JSON input template such as {"query":"{{query}}"} safely. */
export function fillTemplate(template: string, vars: Record<string, string>): Record<string, unknown> {
  const parsed = JSON.parse(template) as unknown;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(parsed) as Record<string, unknown>;
}

export type NormalizedDoc = { url: string; title: string | null; snippet: string | null; content: string | null; publishedDate: string | null };

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

/**
 * Provider outputs differ (Exa, Apify actors, Browserbase…). Walk the output
 * and collect anything that looks like a document: an object with a URL and
 * some text. Deduplicated by URL.
 */
export function normalizeDocs(output: unknown, limit = 10): NormalizedDoc[] {
  const docs = new Map<string, NormalizedDoc>();
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || v == null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const url = pick(o, ["url", "link", "href", "sourceUrl", "source_url", "loadedUrl"]);
    if (url && /^https?:\/\//.test(url) && !docs.has(url)) {
      docs.set(url, {
        url,
        title: pick(o, ["title", "name", "headline", "pageTitle"]),
        snippet: pick(o, ["snippet", "description", "summary", "highlight", "excerpt"]),
        content: pick(o, ["text", "content", "markdown", "body", "fullText", "page_content"]),
        publishedDate: pick(o, ["publishedDate", "published_date", "date", "publishedAt"]),
      });
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  visit(output, 0);
  return [...docs.values()].slice(0, limit);
}

/** Pull the main text out of a single-page extraction output. */
export function extractText(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null;
  const docs = normalizeDocs(output, 1);
  if (docs[0]?.content) return docs[0].content;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    return pick(o, ["text", "content", "markdown", "body"]);
  }
  return null;
}
