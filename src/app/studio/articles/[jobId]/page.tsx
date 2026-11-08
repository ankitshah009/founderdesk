import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { AgentDesk } from "@/components/review/agent-desk";
import { QualityCard } from "@/components/review/quality-card";
import { StageChip } from "@/components/stages";
import { Card, PageHead, SignedOut, Skeleton, timeAgo } from "@/components/studio/shared";
import { Button, ButtonLink, Chip, cn } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { approvals, drafts, editRequests, jobs, reviews, type Draft } from "@/lib/db/schema";
import { links } from "@/lib/links";
import { diffDocuments, diffStats } from "@/lib/studio/diff";
import { studioSession } from "@/lib/studio/session";
import { agentLog, getProfile } from "@/lib/studio/store";
import { adaptForPersona } from "../../actions";

export const metadata: Metadata = { title: "Article" };

type Params = Promise<{ jobId: string }>;
type Search = Promise<{ a?: string; b?: string }>;

export default function ArticlePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Article params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const AUTHOR: Record<Draft["author"], string> = { writer: "Writer", founder_edit: "Your edit", ai_edit: "Highlight & ask" };
const UUID = /^[0-9a-f-]{36}$/i;

async function Article({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { jobId } = await params;
  const { a, b } = await searchParams;
  const db = await getDb();
  const [job] = UUID.test(jobId) ? await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.founderEmail, session.email.toLowerCase()))).limit(1) : [];
  if (!job) {
    return (
      <Card title="Article not found">
        <p className="text-sm text-muted">There&apos;s no article with that link in your workspace.</p>
        <Link href="/studio" className="mt-4 inline-block text-sm text-accent-ink hover:text-accent">Back to overview</Link>
      </Card>
    );
  }
  const [versions, reviewRows, approvalRows, edits, runs, profile] = await Promise.all([
    db.select().from(drafts).where(eq(drafts.jobId, job.id)).orderBy(asc(drafts.version)),
    db.select().from(reviews).where(eq(reviews.jobId, job.id)).orderBy(desc(reviews.createdAt)),
    db.select().from(approvals).where(eq(approvals.jobId, job.id)),
    db.select().from(editRequests).where(eq(editRequests.jobId, job.id)).orderBy(desc(editRequests.createdAt)),
    agentLog([job.id], 200),
    getProfile(session.email),
  ]);
  const latest = versions.at(-1);
  const latestReview = reviewRows[0];
  const latestScored = reviewRows.find((r) => r.scores);
  const reviewFor = (draftId: string) => reviewRows.find((r) => r.draftId === draftId);

  const vb = versions.find((v) => v.version === Number(b)) ?? latest;
  const va = versions.find((v) => v.version === Number(a)) ?? (vb ? versions.filter((v) => v.version < vb.version).at(-1) : undefined);
  const otherPersonas = profile.personas.filter((p) => p.id !== job.personaId);
  const title = latest?.title ?? job.topic;

  return (
    <>
      <Link href="/studio" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Overview
      </Link>
      <PageHead label="Article" title={title} lede={latest?.dek ?? job.thesis ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <StageChip stage={job.stage} />
          {job.stage === "READY_FOR_APPROVAL" ? <ButtonLink href={links.reviewPath(job.id)}>Review &amp; approve</ButtonLink> : versions.length ? <ButtonLink href={links.reviewPath(job.id)} variant="secondary">Review page</ButtonLink> : null}
          <ButtonLink href={links.orderPath(job.id)} variant="ghost">Order</ButtonLink>
        </div>
      </PageHead>
      {job.stageReason && (job.stage === "WAITING_FOR_FOUNDER" || job.stage === "UNABLE_TO_COMPLETE") ? (
        <p className="mb-6 rounded-xl border border-accent/25 bg-accent-tint p-3 text-sm text-fg-2">{job.stageReason}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {latestScored?.scores ? (
          <div>
            <QualityCard scores={latestScored.scores} />
            {latestReview?.summary ? <p className="mt-3 text-xs text-muted">{latestReview.summary}</p> : null}
          </div>
        ) : (
          <Card title="Quality">
            <p className="text-sm text-muted">The Reviewer scores the draft once it&apos;s written: accuracy, sources, originality, voice, readability and search.</p>
          </Card>
        )}
        <div>
          <AgentDesk runs={runs} />
        </div>
      </div>

      <section className="mt-10">
        <Card title="Version history" aside={<span className="text-xs text-muted">{versions.length} version{versions.length === 1 ? "" : "s"}</span>}>
          {versions.length ? (
            <ol className="divide-y divide-line">
              {[...versions].reverse().map((v) => {
                const r = reviewFor(v.id);
                const appr = approvalRows.filter((x) => x.draftId === v.id);
                const prev = versions.filter((x) => x.version < v.version).at(-1);
                const st = prev ? diffStats(prev.bodyMarkdown, v.bodyMarkdown) : null;
                const selected = vb?.id === v.id;
                return (
                  <li key={v.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-3", selected && "bg-white/[0.02]")}>
                    <span className="w-8 text-sm font-semibold tabular-nums text-fg">v{v.version}</span>
                    <Chip tone={v.author === "writer" ? "neutral" : v.author === "founder_edit" ? "accent" : "blue"}>{AUTHOR[v.author]}</Chip>
                    <span className="text-xs text-subtle">{timeAgo(v.createdAt)}</span>
                    <code className="text-[11px] text-subtle">{v.contentHash.slice(0, 8)}</code>
                    {st ? (
                      <span className="text-[11px] tabular-nums">
                        <span className="text-green">+{st.added}</span> <span className="text-red">−{st.removed}</span>
                      </span>
                    ) : null}
                    {r ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {r.outcome.replace(/_/g, " ").toLowerCase()}
                        {r.scores ? <Chip tone={r.scores.overall >= 80 ? "green" : r.scores.overall >= 60 ? "amber" : "red"}>{r.scores.overall}</Chip> : null}
                      </span>
                    ) : null}
                    {appr.map((x) => (
                      <Chip key={x.id} tone="green">Approved · {x.destination}</Chip>
                    ))}
                    {prev ? (
                      <Link href={`/studio/articles/${job.id}?a=${prev.version}&b=${v.version}#diff`} scroll={false} className="ml-auto text-xs text-muted hover:text-fg">
                        Compare with v{prev.version}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">No drafts yet. The Writer&apos;s first draft appears here, and so does every edit after it.</p>
          )}
        </Card>
      </section>

      {va && vb && va.id !== vb.id ? <DiffView a={va} b={vb} versions={versions} jobId={job.id} /> : null}

      {edits.length ? (
        <section className="mt-10">
          <Card title="Highlight & ask requests">
            <ul className="space-y-3">
              {edits.map((e) => (
                <li key={e.id} className="rounded-xl border border-line p-3">
                  <blockquote className="border-l-2 border-line-strong pl-3 text-xs text-muted">{e.selection.slice(0, 300)}</blockquote>
                  <p className="mt-2 text-sm text-fg">{e.instruction}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                    <Chip tone={e.status === "applied" ? "green" : e.status === "failed" ? "red" : e.status === "pending" ? "blue" : "neutral"}>{e.status}</Chip>
                    <span>{timeAgo(e.createdAt)}</span>
                    {e.note ? <span>· {e.note}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {otherPersonas.length ? (
        <section className="mt-10">
          <Card title="Adapt for a persona">
            <p className="mb-4 text-sm text-muted">Start a new article that rewrites this one for a different reader. It goes through the full desk: research, draft, fact-check and your approval.</p>
            <div className="flex flex-wrap gap-2">
              {otherPersonas.map((p) => (
                <form key={p.id} action={adaptForPersona}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="personaId" value={p.id} />
                  <Button type="submit" variant="secondary" title={p.description}>
                    <Users className="size-3.5" aria-hidden /> {p.name}
                  </Button>
                </form>
              ))}
            </div>
          </Card>
        </section>
      ) : null}
    </>
  );
}

function DiffView({ a, b, versions, jobId }: { a: Draft; b: Draft; versions: Draft[]; jobId: string }) {
  const doc = diffDocuments(`# ${a.title}\n\n${a.dek}\n\n${a.bodyMarkdown}`, `# ${b.title}\n\n${b.dek}\n\n${b.bodyMarkdown}`);
  const st = diffStats(a.bodyMarkdown, b.bodyMarkdown);
  // Collapse runs of unchanged paragraphs, keeping one paragraph of context on each side of a change.
  const changed = (i: number) => !!doc[i] && doc[i]!.kind !== "same";
  const keep = doc.map((_, i) => changed(i) || changed(i - 1) || changed(i + 1));
  const blocks: Array<{ hidden: number } | { i: number }> = [];
  doc.forEach((_, i) => {
    if (keep[i]) blocks.push({ i });
    else {
      const last = blocks.at(-1);
      if (last && "hidden" in last) last.hidden++;
      else blocks.push({ hidden: 1 });
    }
  });
  return (
    <section id="diff" className="mt-6 scroll-mt-28">
      <Card
        title={`v${a.version} → v${b.version}`}
        aside={
          <span className="text-xs tabular-nums">
            <span className="text-green">+{st.added} words</span> <span className="text-red">−{st.removed} words</span>
          </span>
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
          {versions.slice(1).map((v) => {
            const prev = versions.filter((x) => x.version < v.version).at(-1)!;
            const active = v.id === b.id && prev.id === a.id;
            return (
              <Link key={v.id} href={`/studio/articles/${jobId}?a=${prev.version}&b=${v.version}#diff`} scroll={false} className={cn("rounded-full border px-2.5 py-0.5", active ? "border-accent/40 bg-accent-tint text-accent-ink" : "border-line text-muted hover:text-fg")}>
                v{prev.version}→v{v.version}
              </Link>
            );
          })}
          {versions.length > 2 ? (
            <Link href={`/studio/articles/${jobId}?a=${versions[0]!.version}&b=${versions.at(-1)!.version}#diff`} scroll={false} className="rounded-full border border-line px-2.5 py-0.5 text-muted hover:text-fg">
              First→latest
            </Link>
          ) : null}
        </div>
        <div className="space-y-3 text-sm leading-relaxed">
          {blocks.map((blk, k) =>
            "hidden" in blk ? (
              <p key={`h${k}`} className="rounded-md bg-white/[0.03] py-1 text-center text-[11px] text-subtle">{blk.hidden} unchanged paragraph{blk.hidden === 1 ? "" : "s"}</p>
            ) : (
              <p key={blk.i} className={cn("whitespace-pre-wrap", doc[blk.i]!.kind === "same" ? "text-muted" : "text-fg-2", doc[blk.i]!.kind === "added" && "border-l-2 border-green/50 pl-3", doc[blk.i]!.kind === "removed" && "border-l-2 border-red/50 pl-3")}>
                {doc[blk.i]!.parts.map((part, j) =>
                  part.type === "add" ? (
                    <ins key={j} className="bg-green/10 text-green no-underline decoration-green/60 underline-offset-2 [text-decoration-line:underline]">{part.text}</ins>
                  ) : part.type === "del" ? (
                    <del key={j} className="bg-red/10 text-red/80 decoration-red/70">{part.text}</del>
                  ) : (
                    <span key={j}>{part.text}</span>
                  ),
                )}
              </p>
            ),
          )}
        </div>
      </Card>
    </section>
  );
}
