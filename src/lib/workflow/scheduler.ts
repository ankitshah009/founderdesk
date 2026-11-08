import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { approvals, dispatches, drafts, jobs, publications } from "@/lib/db/schema";
import { GateError, normalizePublishAt } from "./publish";

/**
 * The founder's queue of approved-but-not-yet-live items, across all their
 * articles: the article itself (while the job waits in PUBLISHING) and each
 * channel post. Every change goes through the same records the publish step
 * reads (approvals.scheduledAt and the pending publish dispatch), so the
 * gate still re-checks the exact approved version when anything goes out.
 */

export type QueueItem = { jobId: string; draftId: string; title: string; destination: string; at: Date };

export async function upcomingFor(email: string, now = Date.now()): Promise<QueueItem[]> {
  const db = await getDb();
  const owned = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.founderEmail, email.toLowerCase()), inArray(jobs.stage, ["PUBLISHING", "PUBLISHED", "COMPLETE"])));
  if (!owned.length) return [];
  const ids = owned.map((j) => j.id);
  const [rows, pubs] = await Promise.all([
    db
      .select({ jobId: approvals.jobId, draftId: approvals.draftId, destination: approvals.destination, at: approvals.scheduledAt, title: drafts.title })
      .from(approvals)
      .innerJoin(drafts, eq(drafts.id, approvals.draftId))
      .where(inArray(approvals.jobId, ids)),
    db.select({ jobId: publications.jobId, destination: publications.destination, status: publications.status }).from(publications).where(inArray(publications.jobId, ids)),
  ]);
  return rows
    .filter((r) => r.at && r.at.getTime() > now && !pubs.some((p) => p.jobId === r.jobId && p.destination === r.destination && p.status === "published"))
    .map((r) => ({ jobId: r.jobId, draftId: r.draftId, title: r.title, destination: r.destination, at: r.at! }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function ownedApproval(email: string, jobId: string, destination: string) {
  const db = await getDb();
  const [row] = await db
    .select({ a: approvals, publishAt: jobs.publishAt })
    .from(approvals)
    .innerJoin(jobs, eq(jobs.id, approvals.jobId))
    .where(and(eq(approvals.jobId, jobId), eq(approvals.destination, destination), eq(jobs.founderEmail, email.toLowerCase())))
    .limit(1);
  if (!row) throw new GateError("That post isn't in your queue.");
  const [live] = await db
    .select({ status: publications.status })
    .from(publications)
    .where(and(eq(publications.jobId, jobId), eq(publications.destination, destination), eq(publications.status, "published")))
    .limit(1);
  if (live) throw new GateError("That one has already gone out.");
  return row;
}

/** Point the pending publish step (if it exists yet) at a new time. */
async function retimeDispatch(jobId: string, destination: string, at: Date) {
  const db = await getDb();
  await db
    .update(dispatches)
    .set({ nextRunAt: at })
    .where(and(eq(dispatches.jobId, jobId), eq(dispatches.kind, "publish"), eq(dispatches.status, "pending"), sql`${dispatches.input}->>'destination' = ${destination}`));
}

/** Move one item. A post never goes out before its article. */
export async function reschedule(email: string, jobId: string, destination: string, rawAt: Date): Promise<Date> {
  const { a, publishAt } = await ownedApproval(email, jobId, destination);
  const at = normalizePublishAt(rawAt) ?? new Date();
  const db = await getDb();
  if (destination === "web") {
    await db.update(approvals).set({ scheduledAt: at }).where(and(eq(approvals.draftId, a.draftId), eq(approvals.destination, "web")));
    await db.update(jobs).set({ publishAt: at, stageReason: `Scheduled for ${at.toISOString()}`, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    // Posts set earlier than the new article time now wait for it.
    const posts = await db.select().from(approvals).where(eq(approvals.draftId, a.draftId));
    for (const p of posts) if (p.destination !== "web" && (!p.scheduledAt || p.scheduledAt < at)) await db.update(approvals).set({ scheduledAt: at }).where(eq(approvals.id, p.id));
    await retimeDispatch(jobId, "web", at);
    return at;
  }
  const floor = publishAt && publishAt > at ? publishAt : at;
  await db.update(approvals).set({ scheduledAt: floor }).where(eq(approvals.id, a.id));
  await retimeDispatch(jobId, destination, floor);
  return floor;
}

/** Send one item right away (a post still waits for its article to be live). */
export async function postNow(email: string, jobId: string, destination: string): Promise<void> {
  if (destination === "web") {
    const { publishNow } = await import("./publish");
    await ownedApproval(email, jobId, "web");
    await publishNow(jobId);
    return;
  }
  const { a } = await ownedApproval(email, jobId, destination);
  const db = await getDb();
  await db.update(approvals).set({ scheduledAt: null }).where(eq(approvals.id, a.id));
  await retimeDispatch(jobId, destination, new Date());
}

/**
 * Drop one channel post from the queue. Withdrawing the approval means the
 * publish step refuses it even if it was already queued. The article itself
 * is cancelled from the order page, which returns it to review.
 */
export async function cancelPost(email: string, jobId: string, destination: string): Promise<void> {
  if (destination === "web") throw new GateError("Cancel the article from its order page; that returns it to review.");
  const { a } = await ownedApproval(email, jobId, destination);
  const db = await getDb();
  await db
    .update(dispatches)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(dispatches.jobId, jobId), eq(dispatches.kind, "publish"), eq(dispatches.status, "pending"), sql`${dispatches.input}->>'destination' = ${destination}`));
  await db.delete(approvals).where(eq(approvals.id, a.id));
  await db
    .update(jobs)
    .set({ destinations: sql`(SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM jsonb_array_elements_text(${jobs.destinations}) AS d WHERE d <> ${destination})`, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}
