import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Mark } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { getDb } from "@/lib/db/client";
import { approvals, drafts, images, jobs, publications, sources } from "@/lib/db/schema";

export default function ArticlePage(props: PageProps<"/a/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-96 w-full max-w-[720px] rounded-xl bg-white/[0.03]" aria-busy />}>
      <Article {...props} />
    </Suspense>
  );
}

async function load(slug: string) {
  await connection();
  const db = await getDb();
  const [pub] = await db
    .select()
    .from(publications)
    .where(and(eq(publications.slug, slug), eq(publications.destination, "web"), inArray(publications.status, ["publishing", "published"])))
    .limit(1);
  if (!pub) return null;
  const [[draft], [job], srcs, imgs] = await Promise.all([
    db.select().from(drafts).where(eq(drafts.id, pub.draftId)).limit(1),
    db.select({ founderName: jobs.founderName, audience: jobs.audience }).from(jobs).where(eq(jobs.id, pub.jobId)).limit(1),
    db.select().from(sources).where(eq(sources.jobId, pub.jobId)),
    pub.approvalId ? db.select({ imageIds: approvals.imageIds }).from(approvals).where(eq(approvals.id, pub.approvalId)).limit(1) : Promise.resolve([]),
  ]);
  // Only the images the founder chose at approval, in the order chosen.
  const chosen = imgs[0]?.imageIds ?? [];
  const rows = chosen.length
    ? await db.select({ id: images.id, slot: images.slot }).from(images).where(and(inArray(images.id, chosen), eq(images.status, "ready")))
    : [];
  const ordered = chosen.map((id) => rows.find((r) => r.id === id)).filter((r): r is { id: string; slot: string } => !!r);
  return { pub, draft: draft!, job: job!, sources: srcs, images: ordered };
}

async function Article({ params }: PageProps<"/a/[slug]">) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { pub, draft, job } = data;
  // Serve exactly the approved content: the publication's hash must match the draft.
  if (pub.contentHash !== draft.contentHash) notFound();
  const cited = new Set([...draft.bodyMarkdown.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!));
  const citedSources = data.sources.filter((s) => cited.has(s.ref)).sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
  const date = pub.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <title>{draft.title}</title>
      <meta name="description" content={draft.dek} />
      <meta property="og:title" content={draft.title} />
      <meta property="og:description" content={draft.dek} />
      <meta property="og:type" content="article" />
      <meta name="founderdesk:content-hash" content={pub.contentHash} />
      <link rel="canonical" href={pub.url ?? undefined} />
      <meta property="og:url" content={pub.url ?? undefined} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={draft.title} />
      <meta name="twitter:description" content={draft.dek} />
      {job.founderName ? <meta name="author" content={job.founderName} /> : null}
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: draft.title,
            description: draft.dek,
            datePublished: pub.createdAt.toISOString(),
            dateModified: pub.createdAt.toISOString(),
            mainEntityOfPage: pub.url,
            author: job.founderName ? { "@type": "Person", name: job.founderName } : undefined,
            publisher: { "@type": "Organization", name: "FounderDesk" },
            citation: citedSources.filter((s) => s.url).map((s) => ({ "@type": "CreativeWork", name: s.title ?? s.url, url: s.url })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <main className="flex-1">
        <article className="mx-auto max-w-[720px] px-4 pt-16 pb-20 md:pt-24">
          <p className="mono-label">{date}</p>
          <h1 className="mt-5 text-[2.25rem] font-medium leading-[1.1] tracking-[-0.03em] text-fg md:text-[2.75rem]">{draft.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">{draft.dek}</p>
          {job.founderName ? <p className="mt-6 text-sm text-fg-2">By {job.founderName}</p> : null}
          {data.images.find((i) => i.slot === "hero") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/images/${data.images.find((i) => i.slot === "hero")!.id}`} alt="" className="mt-10 aspect-[3/2] w-full rounded-2xl object-cover" />
          ) : null}
          <div className="mt-10 border-t border-line pt-2">
            <Markdown source={draft.bodyMarkdown} skipSources />
          </div>
          {data.images.filter((i) => i.slot !== "hero").length ? (
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {data.images
                .filter((i) => i.slot !== "hero")
                .map((i) => (
                  <figure key={i.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/images/${i.id}`} alt="" className="aspect-[3/2] w-full rounded-xl object-cover" />
                    <figcaption className="mt-2 text-xs text-subtle">{i.slot}</figcaption>
                  </figure>
                ))}
            </div>
          ) : null}
          <section id="sources" className="mt-14 border-t border-line pt-8">
            <h2 className="text-sm font-medium text-fg">Sources</h2>
            <ol className="mt-4 space-y-3 text-sm">
              {citedSources.map((s) => (
                <li key={s.id} id={`source-${s.ref}`} className="flex gap-3 text-muted">
                  <span className="w-7 shrink-0 font-mono text-xs leading-5 text-accent-ink">{s.ref}</span>
                  <span className="min-w-0 break-words">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-fg-2 underline decoration-white/25 underline-offset-2 hover:decoration-white">
                        {s.title ?? s.url}
                      </a>
                    ) : (
                      <span className="text-fg-2">{s.title ?? "Founder-provided document"}</span>
                    )}
                    {s.kind === "attachment" ? <span className="text-subtle"> · provided by the author</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <footer className="mt-16 flex items-center justify-between border-t border-line pt-6 text-xs text-subtle">
            <span>Approved by the author before publication.</span>
            <Link href="/" className="inline-flex items-center gap-1.5 hover:text-fg-2">
              <Mark size={14} /> FounderDesk
            </Link>
          </footer>
        </article>
      </main>
    </>
  );
}
