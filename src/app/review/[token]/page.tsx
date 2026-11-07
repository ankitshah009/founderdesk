import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Wordmark } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { IN_PROGRESS, StageChip } from "@/components/stages";
import { ButtonLink, Chip, MonoLabel } from "@/components/ui";
import { articleSlug } from "@/lib/brief";
import { connectedSocial } from "@/lib/destinations/social";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { orderView } from "@/lib/views";
import { ApprovePanel, EditPanel } from "./review-actions";

export const metadata: Metadata = { title: "Review your article", robots: { index: false, follow: false } };

export default function ReviewPage(props: PageProps<"/review/[token]">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-4 md:px-6">
          <Wordmark />
          <span className="text-xs text-muted">Private review page</span>
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto mt-16 h-96 w-full max-w-[1240px] rounded-xl bg-white/[0.03]" aria-busy />}>
        <Review {...props} />
      </Suspense>
    </div>
  );
}

async function Review({ params }: PageProps<"/review/[token]">) {
  await connection();
  const { token } = await params;
  const jobId = verifyLink(token, "review");
  if (!jobId) notFound();
  const v = await orderView(jobId);
  if (!v?.draft) notFound();
  const { job, draft, review, sources, web } = v;
  const ready = job.stage === "READY_FOR_APPROVAL" && review?.outcome === "READY_FOR_APPROVAL";
  const cited = new Set([...draft.bodyMarkdown.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!));
  const citedSources = sources.filter((s) => cited.has(s.ref));
  const passages = new Map<string, string>();
  for (const e of v.evidence) if (e.sourceRef && !passages.has(e.sourceRef) && e.kind === "supporting") passages.set(e.sourceRef, e.passage);
  const resolved = (review?.findings ?? []).filter((f) => f.resolved || f.kind === "scope_mismatch" || f.kind === "boundary_violation");

  return (
    <main className="mx-auto grid w-full max-w-[1240px] flex-1 gap-0 md:grid-cols-[1fr_360px]">
      <article className="min-w-0 border-line px-4 py-10 md:border-r md:px-12 md:py-14">
        <div className="mx-auto max-w-[680px]">
          <div className="mb-8 flex flex-wrap items-center gap-2.5">
            <StageChip stage={job.stage} />
            <Chip>Version {draft.version}</Chip>
            {draft.author === "founder_edit" ? <Chip tone="blue">Your edit</Chip> : null}
            <AutoRefresh tickUrl={`/api/orders/${job.id}/tick?t=${encodeURIComponent(token)}`} active={IN_PROGRESS.includes(job.stage)} />
          </div>
          <h1 className="text-[2.25rem] font-medium leading-[1.12] tracking-[-0.03em] text-fg">{draft.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{draft.dek}</p>
          <div className="mt-8 border-t border-line pt-2">
            <Markdown source={draft.bodyMarkdown} skipSources opts={{ citeHref: (ref) => `#src-${ref}` }} />
          </div>
          <div className="mt-12 rounded-xl border border-line bg-panel p-5">
            <MonoLabel>Announcement</MonoLabel>
            <p className="mt-2 text-sm text-fg-2">{draft.announcement.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</p>
          </div>
        </div>
      </article>

      <aside className="space-y-6 px-4 pb-28 pt-6 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:px-6 md:py-10">
        <section className="rounded-xl border border-line bg-panel p-5">
          {ready ? (
            <>
              <p className="text-sm text-fg">Approve this version</p>
              <p className="mt-1 mb-5 text-xs text-muted">Read it through. Nothing is published until you approve.</p>
              <ApprovePanel token={token} draftId={draft.id} contentHash={draft.contentHash} destination={links.article(articleSlug(draft.title, job.id))} social={connectedSocial().map((a) => ({ id: a.id, label: a.label }))} />
              <div className="mt-3">
                <EditPanel token={token} draftId={draft.id} draft={draft} />
              </div>
            </>
          ) : job.stage === "PUBLISHED" || job.stage === "COMPLETE" ? (
            <>
              <p className="text-sm text-fg">Published</p>
              <p className="mt-1 mb-4 text-xs text-muted">This version is live and was verified after publishing.</p>
              {web?.url ? <ButtonLink href={web.url}>Open the article</ButtonLink> : null}
            </>
          ) : (
            <>
              <p className="text-sm text-fg">Not ready for approval</p>
              <p className="mt-1 text-xs text-muted">{job.stageReason ?? "This version is still being worked on. The page updates automatically."}</p>
              <div className="mt-4">
                <ButtonLink href={links.orderPath(job.id)} variant="secondary">
                  View order status
                </ButtonLink>
              </div>
            </>
          )}
        </section>

        {draft.corrections.length || resolved.length ? (
          <section>
            <MonoLabel className="mb-3">Significant corrections</MonoLabel>
            <ul className="space-y-2.5">
              {draft.corrections.map((c) => (
                <li key={c} className="rounded-lg border border-amber/20 bg-amber/[0.06] px-3 py-2.5 text-sm text-fg-2">
                  {c}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <MonoLabel className="mb-3">Sources beside claims</MonoLabel>
          <ul className="space-y-2.5">
            {citedSources.map((s) => (
              <li key={s.id} id={`src-${s.ref}`} className="scroll-mt-6 rounded-lg border border-line bg-panel p-3 text-sm target:border-accent/60">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-accent-ink">{s.ref}</span>
                  <span className="truncate text-fg-2">{s.title ?? s.url ?? "Source"}</span>
                </div>
                {passages.get(s.ref) ? <p className="mt-2 border-l-2 border-white/15 pl-2.5 text-xs leading-relaxed text-muted">“{passages.get(s.ref)}”</p> : null}
                <p className="mt-2 text-[11px] text-subtle">
                  {s.kind === "attachment" ? "Your attachment" : s.kind === "founder_url" ? "Your link" : "Found in research"}
                  {s.url ? (
                    <>
                      {" · "}
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-fg-2">
                        open
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
            {!citedSources.length ? <li className="text-sm text-muted">No external sources are cited in this version.</li> : null}
          </ul>
        </section>
      </aside>
    </main>
  );
}
