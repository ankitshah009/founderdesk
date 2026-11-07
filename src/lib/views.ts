import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { approvals, dispatches, drafts, outboundMessages, providerEvents, publications, reviews } from "@/lib/db/schema";
import { getJob, jobEvidence, jobSources } from "@/lib/workflow/store";

/** Everything a page needs about one order, loaded in parallel. */
export async function orderView(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return null;
  const db = await getDb();
  const [draftRows, reviewRows, pubs, outbox, srcs, ev, approvalRows] = await Promise.all([
    db.select().from(drafts).where(eq(drafts.jobId, jobId)).orderBy(desc(drafts.version)),
    db.select().from(reviews).where(eq(reviews.jobId, jobId)).orderBy(desc(reviews.createdAt)),
    db.select().from(publications).where(eq(publications.jobId, jobId)).orderBy(asc(publications.createdAt)),
    db.select().from(outboundMessages).where(eq(outboundMessages.jobId, jobId)).orderBy(asc(outboundMessages.createdAt)),
    jobSources(jobId),
    jobEvidence(jobId),
    db.select().from(approvals).where(eq(approvals.jobId, jobId)).orderBy(asc(approvals.approvedAt)),
  ]);
  const draft = draftRows[0] ?? null;
  const review = draft ? (reviewRows.find((r) => r.draftId === draft.id) ?? null) : null;
  return { job, draft, drafts: draftRows, review, reviews: reviewRows, publications: pubs, web: pubs.find((p) => p.destination === "web") ?? null, outbox, sources: srcs, evidence: ev, approvals: approvalRows };
}

export type OrderView = NonNullable<Awaited<ReturnType<typeof orderView>>>;

export async function deskJobView(jobId: string) {
  const base = await orderView(jobId);
  if (!base) return null;
  const db = await getDb();
  const [work, events] = await Promise.all([
    db.select().from(dispatches).where(eq(dispatches.jobId, jobId)).orderBy(asc(dispatches.createdAt)),
    db.select().from(providerEvents).where(eq(providerEvents.jobId, jobId)).orderBy(asc(providerEvents.receivedAt)),
  ]);
  return { ...base, dispatches: work, events };
}
