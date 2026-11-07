import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  dispatches,
  drafts,
  evidence,
  jobs,
  reviews,
  sources,
  type DispatchKind,
  type Job,
  type JobStage,
  type Source,
} from "@/lib/db/schema";

export async function getJob(id: string): Promise<Job | null> {
  const db = await getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ?? null;
}

/**
 * Compare-and-set stage change. Returns the updated job only if it was in one
 * of the expected stages, so concurrent workers can never both advance it.
 */
export async function transition(jobId: string, from: JobStage[], to: JobStage, reason?: string | null, extra: Partial<Job> = {}): Promise<Job | null> {
  const db = await getDb();
  const [row] = await db
    .update(jobs)
    .set({ ...extra, stage: to, stageReason: reason ?? null, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), inArray(jobs.stage, from)))
    .returning();
  return row ?? null;
}

/** Atomically reserve `n` source labels (S1, S2…) for a job. */
export async function allocateRefs(jobId: string, n: number): Promise<string[]> {
  if (n <= 0) return [];
  const db = await getDb();
  const [row] = await db
    .update(jobs)
    .set({ sourceSeq: sql`${jobs.sourceSeq} + ${n}` })
    .where(eq(jobs.id, jobId))
    .returning({ seq: jobs.sourceSeq });
  const end = row!.seq;
  return Array.from({ length: n }, (_, i) => `S${end - n + i + 1}`);
}

export async function addSources(
  jobId: string,
  items: Array<Pick<Source, "kind"> & Partial<Pick<Source, "url" | "title" | "snippet" | "content" | "provider" | "status" | "contentHash" | "publishedDate" | "meta">>>,
): Promise<Source[]> {
  if (!items.length) return [];
  const db = await getDb();
  const refs = await allocateRefs(jobId, items.length);
  return db
    .insert(sources)
    .values(items.map((it, i) => ({ jobId, ref: refs[i]!, status: "pending" as const, meta: {}, ...it })))
    .returning();
}

export async function jobSources(jobId: string): Promise<Source[]> {
  const db = await getDb();
  return db.select().from(sources).where(eq(sources.jobId, jobId)).orderBy(asc(sources.createdAt));
}

export async function jobEvidence(jobId: string) {
  const db = await getDb();
  return db
    .select({ id: evidence.id, passage: evidence.passage, supports: evidence.supports, kind: evidence.kind, sourceRef: sources.ref })
    .from(evidence)
    .leftJoin(sources, eq(evidence.sourceId, sources.id))
    .where(eq(evidence.jobId, jobId))
    .orderBy(asc(evidence.createdAt));
}

export async function latestDraft(jobId: string) {
  const db = await getDb();
  const [row] = await db.select().from(drafts).where(eq(drafts.jobId, jobId)).orderBy(desc(drafts.version)).limit(1);
  return row ?? null;
}

export async function latestReview(jobId: string) {
  const db = await getDb();
  const [row] = await db.select().from(reviews).where(eq(reviews.jobId, jobId)).orderBy(desc(reviews.createdAt)).limit(1);
  return row ?? null;
}

export async function reviewForDraft(draftId: string) {
  const db = await getDb();
  const [row] = await db.select().from(reviews).where(eq(reviews.draftId, draftId)).orderBy(desc(reviews.createdAt)).limit(1);
  return row ?? null;
}

/**
 * Enqueue work. The request key is the idempotency key for the remote call as
 * well, so a retried or duplicated enqueue can never start the work twice.
 */
export async function enqueue(jobId: string, kind: DispatchKind, requestKey: string, input: Record<string, unknown> = {}) {
  const db = await getDb();
  const [row] = await db
    .insert(dispatches)
    .values({ jobId, kind, requestKey, input })
    .onConflictDoNothing({ target: dispatches.requestKey })
    .returning();
  return row ?? null;
}

export async function openDispatchCount(jobId: string, kinds: DispatchKind[], excludeId?: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dispatches)
    .where(
      and(
        eq(dispatches.jobId, jobId),
        inArray(dispatches.kind, kinds),
        inArray(dispatches.status, ["pending", "started"]),
        excludeId ? ne(dispatches.id, excludeId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

export async function dispatchCount(jobId: string, kind: DispatchKind): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dispatches)
    .where(and(eq(dispatches.jobId, jobId), eq(dispatches.kind, kind)));
  return row?.n ?? 0;
}
