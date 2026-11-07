import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Footer, Nav } from "@/components/chrome";
import { ButtonLink, MonoLabel, cn } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { drafts, jobs, publications } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Articles",
  description: "Researched, reviewed articles written with founders and approved word for word before publication.",
};

/**
 * Public index of published articles, laid out like the blog grid in the
 * Profound capture on Mobbin: pill filter row over a two-column grid of
 * hairline-bordered cards (author · date / category, title, standfirst).
 */
export default function ArticlesPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="hairline-b">
          <div className="frame px-4 pt-16 pb-12 md:px-12 md:pt-20">
            <div className="flex items-start justify-between gap-4">
              <MonoLabel>Articles</MonoLabel>
              <Link href="/start" className="text-xs text-muted hover:text-fg">
                Write yours →
              </Link>
            </div>
            <h1 className="display mt-6 max-w-xl text-fg">Published with FounderDesk</h1>
            <p className="lede mt-4 max-w-md">Every article here was researched, checked claim by claim against its sources, and approved word for word by its author.</p>
          </div>
        </section>
        <Suspense fallback={<GridSkeleton />}>
          <ArticleGrid />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="frame grid md:grid-cols-2" aria-busy>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-56 border-b border-line md:odd:border-r" />
      ))}
    </div>
  );
}

const initials = (name: string | null, email: string) =>
  (name ?? email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

async function loadArticles() {
  await connection();
  // Production without a database: an honest empty state, not an error page.
  if (env().NODE_ENV === "production" && !env().DATABASE_URL) return null;
  const db = await getDb();
  return db
    .select({
      slug: publications.slug,
      publishedAt: publications.createdAt,
      title: drafts.title,
      dek: drafts.dek,
      founderName: jobs.founderName,
      founderEmail: jobs.founderEmail,
      audience: jobs.audience,
    })
    .from(publications)
    .innerJoin(drafts, eq(drafts.id, publications.draftId))
    .innerJoin(jobs, eq(jobs.id, publications.jobId))
    .where(and(eq(publications.destination, "web"), eq(publications.status, "published")))
    .orderBy(desc(publications.createdAt))
    .limit(60);
}

async function ArticleGrid() {
  const rows = await loadArticles();
  return (
    <>
      <div className="frame flex flex-wrap gap-2 px-4 py-5 md:px-12">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#222]">All articles</span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-muted">{rows?.length ?? 0} published</span>
      </div>
      {rows?.length ? (
        <ul className="frame grid border-t border-line md:grid-cols-2">
          {rows.map((a, i) => (
            <li key={a.slug} className={cn("border-b border-line", i % 2 === 0 && "md:border-r")}>
              <Link href={`/a/${a.slug}`} className="flex h-full min-h-56 flex-col justify-between gap-10 p-6 transition-colors hover:bg-white/[0.02] md:p-8">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-fg-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-tint text-[9px] font-medium text-accent-ink">{initials(a.founderName, a.founderEmail)}</span>
                    <span className="truncate">{a.founderName ?? "Founder"}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {a.publishedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} <span className="text-subtle">/</span> <span className="text-fg-2">Article</span>
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-medium leading-snug tracking-[-0.015em] text-fg">{a.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{a.dek}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="frame border-t border-line px-4 py-24 text-center md:px-12">
          <p className="text-fg">No articles published yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">The first one will appear here the moment its author approves it.</p>
          <div className="mt-6">
            <ButtonLink href="/start">Start an article</ButtonLink>
          </div>
        </div>
      )}
    </>
  );
}
