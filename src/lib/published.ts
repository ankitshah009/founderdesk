import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { drafts, jobs, publications } from "@/lib/db/schema";
import { env } from "@/lib/env";

/** Published web articles, newest first (shared by sitemap, llms.txt, index). */
export async function publishedArticles(limit = 500) {
  if (env().NODE_ENV === "production" && !env().DATABASE_URL) return [];
  const db = await getDb();
  return db
    .select({ slug: publications.slug, url: publications.url, publishedAt: publications.createdAt, title: drafts.title, dek: drafts.dek, author: jobs.founderName })
    .from(publications)
    .innerJoin(drafts, eq(drafts.id, publications.draftId))
    .innerJoin(jobs, eq(jobs.id, publications.jobId))
    .where(and(eq(publications.destination, "web"), eq(publications.status, "published")))
    .orderBy(desc(publications.createdAt))
    .limit(limit);
}
