import { and, eq, gte, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { Card, PageHead, SignedOut, Skeleton } from "@/components/studio/shared";
import { Button, Chip, cn } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { articleDaily, drafts, publications, sources } from "@/lib/db/schema";
import { isLive } from "@/lib/env";
import { addDays, ymd } from "@/lib/studio/calendar";
import { percentiles } from "@/lib/studio/ideas";
import { aiSearchReadiness, nextTopics, readRate, refreshCandidates, type ArticleStat } from "@/lib/studio/insights";
import { studioSession } from "@/lib/studio/session";
import { founderJobs, listKnowledge, listPosts } from "@/lib/studio/store";
import { planTopic } from "../actions";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Insights />
    </Suspense>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 112;
  const h = 28;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Views over the last ${values.length} days: ${values.join(", ")}`}>
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="rgb(255 255 255 / 0.08)" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const ORIGIN_LABEL = { performance: "From performance", knowledge: "From your opinions", ideas: "From Idea Lab" } as const;

async function Insights() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { email } = session;
  const db = await getDb();
  const [jobs, knowledge, posts] = await Promise.all([founderJobs(email), listKnowledge(email), listPosts(email)]);
  const ids = jobs.map((j) => j.id);
  const pubs = ids.length
    ? await db.select().from(publications).where(and(inArray(publications.jobId, ids), eq(publications.destination, "web"), eq(publications.status, "published")))
    : [];
  const pubIds = pubs.map((p) => p.id);
  const jobIdsPub = pubs.map((p) => p.jobId);
  const since = ymd(addDays(new Date(), -13));
  const [draftRows, daily, srcs] = pubs.length
    ? await Promise.all([
        db.select().from(drafts).where(inArray(drafts.id, pubs.map((p) => p.draftId))),
        db.select().from(articleDaily).where(and(inArray(articleDaily.publicationId, pubIds), gte(articleDaily.day, since))),
        db.select({ jobId: sources.jobId, publishedDate: sources.publishedDate }).from(sources).where(inArray(sources.jobId, jobIdsPub)),
      ])
    : [[], [], []];
  const draftById = new Map(draftRows.map((d) => [d.id, d]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const days = Array.from({ length: 14 }, (_, i) => ymd(addDays(new Date(), i - 13)));

  const articles = pubs
    .map((p) => {
      const d = draftById.get(p.draftId);
      const job = jobById.get(p.jobId);
      const stat: ArticleStat = {
        jobId: p.jobId,
        title: d?.title ?? job?.topic ?? "Untitled",
        topic: job?.topic ?? "",
        slug: p.slug,
        url: p.url,
        publishedAt: p.createdAt,
        views: p.views,
        reads: p.reads,
        body: d?.bodyMarkdown ?? "",
        sourceDates: srcs.filter((s) => s.jobId === p.jobId).map((s) => s.publishedDate),
      };
      const byDay = new Map(daily.filter((x) => x.publicationId === p.id).map((x) => [x.day, x.views]));
      return { stat, spark: days.map((day) => byDay.get(day) ?? 0), ready: d ? aiSearchReadiness(d) : null };
    })
    .sort((a, b) => b.stat.views - a.stat.views);

  const pct = percentiles(posts);
  const topPosts = posts
    .map((p) => ({ text: p.text, author: p.author, score: Math.round(pct.get(p.id) ?? 0) }))
    .filter((p) => p.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const topics = nextTopics({ articles: articles.map((a) => a.stat), opinions: knowledge.filter((k) => k.kind === "opinion"), topPosts });
  const refreshes = refreshCandidates(articles.map((a) => a.stat));
  const totals = articles.reduce((t, a) => ({ views: t.views + a.stat.views, reads: t.reads + a.stat.reads }), { views: 0, reads: 0 });
  const monid = isLive("monid");

  return (
    <>
      <PageHead label="Insights" title="What's working" lede="Views and reads are counted by our own article pages — first-party only, nothing is tracked off-site." />

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          ["Published", articles.length.toString()],
          ["Views", totals.views.toLocaleString("en-US")],
          ["Read rate", totals.views >= 5 ? `${Math.round((totals.reads / totals.views) * 100)}%` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="mono-label">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</p>
          </div>
        ))}
      </div>

      <Card title="Performance" aside={<span className="text-xs text-muted">Last 14 days</span>}>
        {articles.length ? (
          <div className="-mx-5 overflow-x-auto md:-mx-6">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-subtle">
                  <th className="px-5 py-2 font-normal md:px-6">Article</th>
                  <th className="px-3 py-2 text-right font-normal">Views</th>
                  <th className="px-3 py-2 text-right font-normal">Reads</th>
                  <th className="px-3 py-2 text-right font-normal">Read rate</th>
                  <th className="px-3 py-2 font-normal">Trend</th>
                  <th className="px-5 py-2 text-right font-normal md:px-6">AI search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {articles.map(({ stat, spark, ready }) => {
                  const rr = readRate(stat);
                  return (
                    <tr key={stat.jobId}>
                      <td className="max-w-xs px-5 py-3 md:px-6">
                        <Link href={`/studio/articles/${stat.jobId}`} className="line-clamp-1 text-fg hover:text-accent-ink">{stat.title}</Link>
                        <p className="text-[11px] text-subtle">{stat.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{stat.url ? <> · <a href={stat.url} target="_blank" rel="noreferrer" className="hover:text-fg">view live</a></> : null}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{stat.views.toLocaleString("en-US")}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{stat.reads.toLocaleString("en-US")}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg-2">{rr != null ? `${rr}%` : <span className="text-subtle" title="Shown after 5 views">—</span>}</td>
                      <td className="px-3 py-3"><Sparkline values={spark} /></td>
                      <td className="px-5 py-3 text-right md:px-6">
                        {ready ? (
                          <span title={ready.checks.filter((c) => !c.ok).map((c) => `Missing: ${c.label}`).join("\n") || "All checks pass"}>
                            <Chip tone={ready.score >= 80 ? "green" : ready.score >= 60 ? "amber" : "red"}>{ready.score}</Chip>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No published articles yet. Once an article is live on your FounderDesk page, its views and reads (readers who reach the end) show up here, counted by the page itself.</p>
        )}
        {!monid ? (
          <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
            AI search visibility: connect Monid search to check whether answer engines cite this article. <Link href="/status" className="text-fg-2 hover:text-fg">Integration status</Link>
          </p>
        ) : null}
      </Card>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card title="Next topics">
          {topics.length ? (
            <ul className="space-y-3">
              {topics.map((t) => (
                <li key={t.title} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{t.title}</p>
                    <p className="mt-1 text-xs text-muted">{t.why}</p>
                    <p className="mt-1.5 text-[11px] text-subtle">{ORIGIN_LABEL[t.origin]}</p>
                  </div>
                  <form action={planTopic}>
                    <input type="hidden" name="title" value={t.title} />
                    <input type="hidden" name="notes" value={t.why} />
                    <input type="hidden" name="origin" value={t.origin === "performance" ? "performance" : "founder"} />
                    <Button type="submit" variant="secondary" className="px-2.5 py-1.5 text-xs" title="Adds it a week from today">
                      <CalendarPlus className="size-3.5" aria-hidden /> Add
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Suggestions come from your most-read articles, opinions in your <Link href="/studio/knowledge?kind=opinion" className="text-fg-2 hover:text-fg">knowledge base</Link> you haven&apos;t published, and top posts in <Link href="/studio/ideas" className="text-fg-2 hover:text-fg">Idea Lab</Link>.</p>
          )}
        </Card>

        <Card title="Refresh candidates">
          {refreshes.length ? (
            <ul className="space-y-3">
              {refreshes.map((r) => (
                <li key={r.jobId} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/studio/articles/${r.jobId}`} className="text-sm text-fg hover:text-accent-ink">{r.title}</Link>
                      <Chip tone={r.urgency === "high" ? "amber" : "neutral"}>{r.urgency}</Chip>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {r.reasons.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <form action={planTopic}>
                    <input type="hidden" name="title" value={`Refresh: ${r.title}`} />
                    <input type="hidden" name="notes" value={r.reasons.join(" ")} />
                    <input type="hidden" name="origin" value="refresh" />
                    <Button type="submit" variant="secondary" className={cn("px-2.5 py-1.5 text-xs")}>
                      <RefreshCw className="size-3.5" aria-hidden /> Plan a refresh
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing has aged yet. Articles show up here when they&apos;re 90+ days old, cite figures from two or more years ago, or rest on old sources.</p>
          )}
        </Card>
      </div>
    </>
  );
}
