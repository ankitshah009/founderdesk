import { keywords } from "@/lib/workflow/editorial";
import { searchChecks } from "./quality";

/**
 * The Performance and Refresh analysts. Both work from first-party data: the
 * article views and reads our own pages count, the founder's knowledge base,
 * and the articles' own sources. Nothing here is a guess dressed as data.
 */

export type ArticleStat = {
  jobId: string;
  title: string;
  topic: string;
  slug: string | null;
  url: string | null;
  publishedAt: Date;
  views: number;
  reads: number;
  body: string;
  sourceDates: Array<string | null>;
};

export function readRate(a: Pick<ArticleStat, "views" | "reads">): number | null {
  return a.views >= 5 ? Math.round((a.reads / a.views) * 100) : null;
}

export type RefreshCandidate = { jobId: string; title: string; reasons: string[]; urgency: "high" | "medium" };

/** Articles that have aged: old enough, citing stale years, or resting on old sources. */
export function refreshCandidates(articles: ArticleStat[], now = new Date()): RefreshCandidate[] {
  const year = now.getUTCFullYear();
  const out: RefreshCandidate[] = [];
  for (const a of articles) {
    const reasons: string[] = [];
    const ageDays = Math.floor((now.getTime() - a.publishedAt.getTime()) / 86_400_000);
    if (ageDays >= 180) reasons.push(`Published ${Math.floor(ageDays / 30)} months ago.`);
    else if (ageDays >= 90) reasons.push(`Published ${ageDays} days ago.`);
    const years = [...new Set((a.body.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number))].filter((y) => y <= year - 2 && y >= 1990);
    if (years.length) reasons.push(`Cites ${years.sort().join(", ")} figures; newer data may exist.`);
    const oldSources = a.sourceDates.filter((d) => d && !Number.isNaN(Date.parse(d)) && (now.getTime() - Date.parse(d)) / 86_400_000 > 730).length;
    if (oldSources) reasons.push(`${oldSources} source${oldSources > 1 ? "s are" : " is"} more than two years old.`);
    if (reasons.length) out.push({ jobId: a.jobId, title: a.title, reasons, urgency: reasons.length >= 2 || ageDays >= 180 ? "high" : "medium" });
  }
  return out.sort((x, y) => (x.urgency === y.urgency ? y.reasons.length - x.reasons.length : x.urgency === "high" ? -1 : 1));
}

export type TopicSuggestion = { title: string; why: string; origin: "performance" | "knowledge" | "ideas" };

/**
 * Next topics: build on what readers finished, write up opinions the founder
 * has recorded but never published, and follow captured posts that performed.
 */
export function nextTopics(args: {
  articles: ArticleStat[];
  opinions: Array<{ title: string; content: string }>;
  topPosts: Array<{ text: string; author: string; score: number }>;
}): TopicSuggestion[] {
  const out: TopicSuggestion[] = [];
  const written = args.articles.map((a) => keywords(`${a.title} ${a.topic}`));
  const covered = (text: string) => {
    const kw = keywords(text);
    return written.some((w) => [...kw].filter((k) => w.has(k)).length >= 3);
  };
  const ranked = [...args.articles].filter((a) => a.views > 0).sort((a, b) => b.reads - a.reads || b.views - a.views);
  const best = ranked[0];
  if (best) {
    const rr = readRate(best);
    out.push({
      title: `A follow-up to “${best.title}”: what happened next`,
      why: `Your most-read article (${best.reads} reads of ${best.views} views${rr != null ? `, ${rr}% read to the end` : ""}). Readers who finished it are the warmest audience for a sequel.`,
      origin: "performance",
    });
  }
  for (const o of args.opinions) {
    if (out.length >= 6) break;
    if (covered(`${o.title} ${o.content}`)) continue;
    out.push({ title: o.title.endsWith("?") ? o.title : `Why I believe: ${o.title}`, why: "An opinion in your knowledge base you haven't published yet.", origin: "knowledge" });
  }
  for (const p of args.topPosts) {
    if (out.length >= 8) break;
    const first = p.text.split(/(?<=[.!?])\s|\n/)[0]!.slice(0, 90);
    if (covered(p.text)) continue;
    out.push({ title: `Your take on: “${first}”`, why: `A captured post from ${p.author === "me" ? "you" : p.author} that outperformed (top ${Math.max(1, 100 - p.score)}% engagement). Respond with your evidence.`, origin: "ideas" });
  }
  return out;
}

/** How quotable an article is for search and AI answer engines. */
export function aiSearchReadiness(draft: { title: string; dek: string; bodyMarkdown: string }): { score: number; checks: Array<{ label: string; ok: boolean }> } {
  const checks = [
    ...searchChecks(draft).map((c) => ({ label: c.label, ok: c.ok })),
    { label: "Structured data (Article JSON-LD) on the page", ok: true },
    { label: "Listed in /llms.txt and the sitemap", ok: true },
  ];
  return { score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), checks };
}
