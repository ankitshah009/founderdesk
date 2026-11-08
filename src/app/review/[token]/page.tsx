import { isSoftFinding } from "@/lib/workflow/humanize";
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
import { instagramConnected } from "@/lib/workflow/publish";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { orderView } from "@/lib/views";
import { ApprovePanel, EditPanel } from "./review-actions";
import { GenerateButton } from "./images-panel";
import { declineImages } from "@/app/actions";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { images } from "@/lib/db/schema";
import { isLive } from "@/lib/env";
import { stripe } from "@/lib/integrations/stripe";
import { grantImageCredits } from "@/lib/workflow/images";

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

async function Review({ params, searchParams }: PageProps<"/review/[token]">) {
  await connection();
  const { token } = await params;
  const jobId = verifyLink(token, "review");
  if (!jobId) notFound();
  // Returning from the images Checkout: grant here too (idempotent with the webhook).
  const sp = await searchParams;
  if (typeof sp.session_id === "string" && sp.images === "1" && isLive("stripe")) {
    const session = await stripe().checkout.sessions.retrieve(sp.session_id);
    if (session.metadata?.job_id === jobId && session.metadata?.addon === "images_10" && session.payment_status === "paid") {
      await grantImageCredits(jobId, session.id, session.amount_total);
    }
  }
  const v = await orderView(jobId);
  if (!v?.draft) notFound();
  const db = await getDb();
  const jobImages = await db
    .select({ id: images.id, slot: images.slot, status: images.status, error: images.error })
    .from(images)
    .where(eq(images.jobId, jobId))
    .orderBy(desc(images.createdAt));
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
            <AutoRefresh tickUrl={`/api/orders/${job.id}/tick?t=${encodeURIComponent(token)}`} active={IN_PROGRESS.includes(job.stage) || jobImages.some((i) => i.status === "generating")} />
          </div>
          {ready && job.imageCredits === 0 && !job.imagesDeclined && !jobImages.length ? (
            <div className="mb-8 rounded-2xl border border-accent/30 bg-accent-tint p-5">
              <p className="text-base font-semibold text-fg">Want images with this article?</p>
              <p className="mt-1 text-sm text-fg-2">A header image and section images, made for this article. 10 image credits for $5.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a href={`/api/checkout/${job.id}/images?t=${encodeURIComponent(token)}`} className="bg-accent px-4 py-2 text-sm font-semibold text-[#140a05] hover:bg-[#ff6f3a]">
                  Yes, add images · $5
                </a>
                <form action={declineImages}>
                  <input type="hidden" name="t" value={token} />
                  <button type="submit" className="px-2 py-2 text-sm text-fg-2 hover:text-fg">No thanks</button>
                </form>
              </div>
            </div>
          ) : null}
          <h1 className="text-[2.25rem] font-medium leading-[1.12] tracking-[-0.03em] text-fg">{draft.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{draft.dek}</p>
          {jobImages.find((i) => i.slot === "hero" && i.status === "ready") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/images/${jobImages.find((i) => i.slot === "hero" && i.status === "ready")!.id}`} alt="" className="mt-8 aspect-[3/2] w-full rounded-2xl object-cover" />
          ) : null}
          <div className="mt-8 border-t border-line pt-2">
            <Markdown source={draft.bodyMarkdown} skipSources opts={{ citeHref: (ref) => `#src-${ref}` }} />
          </div>
          <div className="mt-12 space-y-4">
            <MonoLabel>How it will be announced</MonoLabel>
            {draft.variants.xSingle ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-fg-2 uppercase">X · one post</p>
                <p className="whitespace-pre-wrap text-sm text-fg-2">{draft.variants.xSingle.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</p>
              </div>
            ) : null}
            {draft.variants.x?.length ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-fg-2 uppercase">X · thread of {draft.variants.x.length}</p>
                <ol className="space-y-3">
                  {draft.variants.x.map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm text-fg-2">
                      <span className="w-5 shrink-0 text-xs text-subtle">{i + 1}/</span>
                      <span className="whitespace-pre-wrap">{t.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {draft.variants.newsletter ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-fg-2 uppercase">Newsletter · copy and send</p>
                <p className="text-sm font-semibold text-fg">{draft.variants.newsletter.subject}</p>
                <p className="mt-0.5 text-xs text-muted">{draft.variants.newsletter.preview}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{draft.variants.newsletter.body.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</p>
              </div>
            ) : null}
            {draft.variants.instagram ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-fg-2 uppercase">Instagram carousel · {draft.variants.instagram.slides.length} slides</p>
                <ol className="flex gap-2 overflow-x-auto pb-1">
                  {draft.variants.instagram.slides.map((t, i) => (
                    <li key={i} className="flex aspect-square w-32 shrink-0 items-end rounded-lg bg-white/[0.05] p-2.5 text-xs leading-snug text-fg">{t}</li>
                  ))}
                </ol>
                <p className="mt-3 whitespace-pre-wrap text-sm text-fg-2">{draft.variants.instagram.caption}</p>
              </div>
            ) : null}
            {draft.variants.linkedin ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-fg-2 uppercase">LinkedIn</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{draft.variants.linkedin.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</p>
              </div>
            ) : null}
            {!draft.variants.x?.length && !draft.variants.linkedin ? (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="text-sm text-fg-2">{draft.announcement.replace("{{url}}", web?.url ?? links.article(articleSlug(draft.title, job.id)))}</p>
              </div>
            ) : null}
          </div>
        </div>
      </article>

      <aside className="space-y-6 px-4 pb-28 pt-6 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:px-6 md:py-10">
        <section className="rounded-xl border border-line bg-panel p-5">
          {ready ? (
            <>
              <p className="text-sm text-fg">Approve this version</p>
              <p className="mt-1 mb-5 text-xs text-muted">Read it through. Nothing is published until you approve.</p>
              <ApprovePanel token={token} draftId={draft.id} contentHash={draft.contentHash} destination={links.article(articleSlug(draft.title, job.id))} readyImages={jobImages.filter((i) => i.status === "ready").map((i, idx, arr) => ({ id: i.id, slot: i.slot, preselected: arr.findIndex((j) => j.slot === i.slot) === idx }))} social={[...connectedSocial().map((a) => ({ id: a.id as string, label: a.label })), ...(instagramConnected() ? [{ id: "instagram", label: "Instagram (via Mobile Run)" }] : [])]} />
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

        {ready && review?.findings.some((f) => isSoftFinding(f) && !f.resolved) ? (
          <section>
            <MonoLabel className="mb-3">Reviewer notes for you</MonoLabel>
            <ul className="space-y-2.5">
              {review.findings
                .filter((f) => isSoftFinding(f) && !f.resolved)
                .slice(0, 5)
                .map((f) => (
                  <li key={f.id + f.claim.slice(0, 20)} className="rounded-lg border border-line bg-panel p-3 text-sm text-fg-2">
                    {f.claim}
                    {f.proposedFix ? <p className="mt-1.5 text-xs text-muted">Suggestion: {f.proposedFix}</p> : null}
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-subtle">Optional — use “Edit the text” to apply any you agree with.</p>
          </section>
        ) : null}

        {["READY_FOR_APPROVAL", "WAITING_FOR_FOUNDER", "REVIEWING", "WRITING"].includes(job.stage) ? (
          <section className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <MonoLabel>Images</MonoLabel>
              <span className="text-xs text-muted">{job.imageCredits} credit{job.imageCredits === 1 ? "" : "s"} left</span>
            </div>
            {job.imageCredits > 0 ? (
              <div className="space-y-2">
                <GenerateButton token={token} slot="hero" label="Generate a header image" />
                {[...draft.bodyMarkdown.matchAll(/^##\s+(.+)$/gm)]
                  .map((m) => m[1]!.trim())
                  .filter((h) => !/^sources$/i.test(h))
                  .slice(0, 4)
                  .map((h) => (
                    <GenerateButton key={h} token={token} slot={h} label={`Image for “${h}”`} />
                  ))}
              </div>
            ) : (
              <a href={`/api/checkout/${job.id}/images?t=${encodeURIComponent(token)}`} className="block rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-semibold text-[#140a05] hover:bg-[#ff6f3a]">
                Add images · 10 credits for $5
              </a>
            )}
            {jobImages.length ? (
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {jobImages.map((i) => (
                  <li key={i.id} className="overflow-hidden rounded-lg border border-line bg-panel-2">
                    {i.status === "ready" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/images/${i.id}`} alt="" className="aspect-[3/2] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/2] items-center justify-center p-2 text-center text-[11px] text-muted">{i.status === "failed" ? "Failed · credit refunded" : "Generating…"}</div>
                    )}
                    <p className="truncate px-2 py-1 text-[11px] text-subtle">{i.slot === "hero" ? "Header" : i.slot}</p>
                  </li>
                ))}
              </ul>
            ) : null}
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
