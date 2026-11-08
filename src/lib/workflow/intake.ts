import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, outboundMessages, providerEvents, type FounderReply, type Job } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parseAddress, parseBrief } from "@/lib/brief";
import { inboundSchema } from "@/lib/integrations/agentmail";
import { queueMessage, templates } from "./outbound";
import { addSources, enqueue, getJob, latestDraft, transition } from "./store";

export type AttachmentInput = {
  filename: string | null;
  contentType: string | null;
  /** Live AgentMail attachments are fetched later through the API. */
  ref?: { inboxId: string; messageId: string; attachmentId: string };
  /** Simulator / web uploads provide the text directly. */
  inlineText?: string;
};

export async function createJob(args: {
  channel: Job["channel"];
  founderEmail: string;
  founderName?: string | null;
  subject?: string | null;
  body: string;
  inboxId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  attachments?: AttachmentInput[];
}): Promise<Job> {
  const brief = parseBrief({ subject: args.subject, body: args.body });
  const db = await getDb();
  const [job] = await db
    .insert(jobs)
    .values({
      channel: args.channel,
      founderEmail: args.founderEmail.toLowerCase(),
      founderName: args.founderName ?? null,
      inboxId: args.inboxId ?? env().AGENTMAIL_INBOX_ID ?? null,
      threadId: args.threadId ?? null,
      firstMessageId: args.messageId ?? null,
      lastMessageId: args.messageId ?? null,
      topic: brief.topic,
      audience: brief.audience,
      thesis: brief.thesis,
      seedText: args.body.slice(0, 20_000),
      sourceUrls: brief.sourceUrls,
      boundaries: brief.boundaries,
      privateTerms: brief.privateTerms,
      amountCents: env().OFFER_AMOUNT_CENTS,
    })
    .returning();
  await addAttachmentSources(job!.id, args.attachments ?? []);
  // Fixed-scope acknowledgement with the Checkout link — a template, no agent.
  const freeEligible = await isFreeEligible(job!.founderEmail);
  await queueMessage(job!, "acknowledgement", `${job!.id}:acknowledgement`, templates.acknowledgement({ ...job!, freeEligible }));
  return job!;
}

async function addAttachmentSources(jobId: string, attachments: AttachmentInput[]) {
  return addSources(
    jobId,
    attachments.map((a) => ({
      kind: "attachment" as const,
      title: a.filename,
      meta: { filename: a.filename, contentType: a.contentType, ...a.ref, ...(a.inlineText != null ? { inlineText: a.inlineText } : {}) },
    })),
  );
}

/**
 * Store a founder reply and resume work. Receiving a reply is not the same as
 * resolving a finding: the reviewer re-assesses, and if the reply does not
 * answer the question the job goes back to waiting.
 */
export async function recordFounderReply(job: Job, args: { text: string; messageId?: string | null; attachments?: AttachmentInput[] }) {
  const created = await addAttachmentSources(job.id, args.attachments ?? []);
  const reply: FounderReply = {
    messageId: args.messageId ?? null,
    text: args.text.slice(0, 10_000),
    receivedAt: new Date().toISOString(),
    attachmentSourceIds: created.map((s) => s.id),
  };
  const db = await getDb();
  const [updated] = await db
    .update(jobs)
    .set({
      founderReplies: sql`${jobs.founderReplies} || ${JSON.stringify([reply])}::jsonb`,
      lastMessageId: args.messageId ?? job.lastMessageId,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id))
    .returning();
  for (const s of created) await enqueue(job.id, "source_fetch", `${job.id}:fetch:${s.id}`, { sourceId: s.id });

  // Editorial memory: a founder's answer to the reviewer is a fact worth keeping for later articles.
  if (job.openQuestions.length && args.text.trim() && !args.text.startsWith(AUTO_REPLY.slice(0, 30))) {
    const { remember } = await import("@/lib/studio/store");
    await remember(job.founderEmail, { kind: "fact", text: `Asked “${job.openQuestions[0]!.slice(0, 160)}” — answered: ${args.text.trim().split("\n")[0]!.slice(0, 220)}`, origin: "founder_reply", jobId: job.id });
  }

  if (updated!.stage === "WAITING_FOR_FOUNDER") {
    const draft = await latestDraft(job.id);
    if (draft && (await transition(job.id, ["WAITING_FOR_FOUNDER"], "REVIEWING", "Re-assessing with the founder's reply"))) {
      await enqueue(job.id, "review", `${job.id}:review:v${draft.version}:r${updated!.founderReplies.length}`, { draftId: draft.id });
    }
  }
  return updated!;
}

/** Persist an inbound provider event once (dedupe on the provider's id). */
export async function persistEvent(provider: "agentmail" | "stripe" | "simulator", externalId: string, type: string, payload: unknown) {
  const db = await getDb();
  const [row] = await db
    .insert(providerEvents)
    .values({ provider, externalId, type, payload: payload as never })
    .onConflictDoNothing({ target: [providerEvents.provider, providerEvents.externalId] })
    .returning();
  return row ?? null;
}

async function markEvent(id: string, status: "processed" | "ignored" | "failed", note?: string, jobId?: string) {
  const db = await getDb();
  await db.update(providerEvents).set({ status, note: note ?? null, jobId: jobId ?? null, processedAt: new Date() }).where(eq(providerEvents.id, id));
}

/**
 * Start the free first article. Proof of the founder's email comes from either
 * the signed link we emailed or a reply on our own thread (only that mailbox
 * received the thread). Returns true when this call started the order.
 */
export async function claimFree(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || job.paymentStatus !== "unpaid" || !(await isFreeEligible(job.founderEmail))) return false;
  const db = await getDb();
  const { fulfillPayment } = await import("./payments");
  try {
    await db.update(jobs).set({ amountCents: 0 }).where(and(eq(jobs.id, jobId), eq(jobs.paymentStatus, "unpaid")));
    return (await fulfillPayment({ jobId, checkoutSessionId: `free_${jobId}`, amountTotal: null })).fulfilled;
  } catch {
    // The partial unique index refused a second free article for this email.
    await db.update(jobs).set({ amountCents: env().OFFER_AMOUNT_CENTS }).where(and(eq(jobs.id, jobId), eq(jobs.paymentStatus, "unpaid")));
    return false;
  }
}

/** Resend the confirm link (or pay link) — at most 3 times per order. */
export async function resendStartEmail(jobId: string): Promise<"sent" | "limit" | "not_needed"> {
  const job = await getJob(jobId);
  if (!job || job.paymentStatus !== "unpaid") return "not_needed";
  const db = await getDb();
  const sent = await db.select({ id: outboundMessages.id }).from(outboundMessages).where(and(eq(outboundMessages.jobId, jobId), eq(outboundMessages.kind, "acknowledgement")));
  if (sent.length >= 4) return "limit";
  const freeEligible = await isFreeEligible(job.founderEmail);
  await queueMessage(job, "acknowledgement", `${job.id}:acknowledgement:resend${sent.length}`, templates.acknowledgement({ ...job, freeEligible }));
  return "sent";
}

/** Turn a persisted AgentMail message.received event into a job or a reply. */
export async function processInboundEvent(eventId: string) {
  const db = await getDb();
  const [event] = await db.select().from(providerEvents).where(eq(providerEvents.id, eventId)).limit(1);
  if (!event || event.status !== "received") return;
  const parsed = inboundSchema.safeParse(event.payload);
  if (!parsed.success || parsed.data.event_type !== "message.received" || !parsed.data.message) {
    return markEvent(event.id, "ignored", parsed.success ? `event ${parsed.data.event_type}` : "unrecognised payload");
  }
  const m = parsed.data.message;
  const fromRaw = Array.isArray(m.from) ? m.from[0] : m.from;
  const from = parseAddress(fromRaw);
  if (!from) return markEvent(event.id, "ignored", "no sender address");
  // Never answer our own outbound mail (loop guard).
  if (from.email === m.inbox_id.toLowerCase()) return markEvent(event.id, "ignored", "message from our own inbox");

  // extracted_text omits quoted history, so a reply is just the new words.
  const text = (m.extracted_text ?? m.text ?? "").trim();
  const attachments: AttachmentInput[] = (m.attachments ?? []).map((a) => ({
    filename: a.filename ?? null,
    contentType: a.content_type ?? null,
    ...(event.provider === "simulator"
      ? { inlineText: String((a as { text?: string }).text ?? "") }
      : { ref: { inboxId: m.inbox_id, messageId: m.message_id, attachmentId: a.attachment_id } }),
  }));

  const [existing] = await db.select().from(jobs).where(eq(jobs.threadId, m.thread_id)).limit(1);
  if (existing) {
    if (existing.founderEmail !== from.email) return markEvent(event.id, "ignored", `reply from ${from.email}, not the job's founder`, existing.id);
    await recordFounderReply(existing, { text, messageId: m.message_id, attachments });
    // Replying on our thread proves the mailbox as well as the emailed link does.
    if (existing.stage === "AWAITING_PAYMENT" && (await claimFree(existing.id))) {
      const { kick } = await import("./run");
      kick();
      return markEvent(event.id, "processed", "founder reply — free article started", existing.id);
    }
    return markEvent(event.id, "processed", "founder reply", existing.id);
  }
  if (!text) return markEvent(event.id, "ignored", "empty message");
  // "login" / "sign in" / "orders": reply with a sign-in challenge. The reply
  // goes to the sending mailbox, so a spoofed From cannot sign anyone in.
  const ask = `${m.subject ?? ""} ${text}`.trim().toLowerCase();
  if (ask.length < 40 && /^(re:\s*)?(log ?in|sign ?in|my orders|orders)\b/.test(ask)) {
    const { startChallenge } = await import("@/lib/auth");
    await startChallenge(from.email).catch(() => undefined);
    return markEvent(event.id, "processed", "sign-in request");
  }
  const job = await createJob({
    channel: "email",
    founderEmail: from.email,
    founderName: from.name,
    subject: m.subject,
    body: m.text ?? text,
    inboxId: m.inbox_id,
    threadId: m.thread_id,
    messageId: m.message_id,
    attachments,
  });
  return markEvent(event.id, "processed", "new job", job.id);
}

export async function findJob(id: string) {
  return getJob(id);
}

export const AUTO_REPLY =
  "No answer received in time — use the supported figure from the sources, and attribute to the founder or cut anything unsupported.";

/**
 * Autonomy: an order never waits on the founder forever. After
 * FOUNDER_WAIT_MINUTES it continues with the conservative choice (the figure
 * the source supports; attribute or cut the rest). A later real reply still
 * applies before approval if the order hasn't been approved yet.
 */
export async function resumeStaleWaits(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - env().FOUNDER_WAIT_MINUTES * 60_000);
  // Claim atomically (bump updatedAt) so concurrent runs never double-answer.
  const waiting = await db
    .update(jobs)
    .set({ updatedAt: new Date() })
    .where(and(eq(jobs.stage, "WAITING_FOR_FOUNDER"), lt(jobs.updatedAt, cutoff)))
    .returning();
  for (const job of waiting) await recordFounderReply(job, { text: AUTO_REPLY, messageId: null });
  return waiting.length;
}

/** First article free: no earlier paid (or free) order for this address. */
export async function isFreeEligible(email: string): Promise<boolean> {
  const db = await getDb();
  const [prior] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.founderEmail, email.toLowerCase()), eq(jobs.paymentStatus, "paid")))
    .limit(1);
  return !prior;
}

/** The earlier order that used this account's free article (or its first paid one), to explain the price. */
export async function priorOrderFor(email: string, exceptJobId: string): Promise<{ id: string; createdAt: Date; free: boolean } | null> {
  const db = await getDb();
  const [prior] = await db
    .select({ id: jobs.id, createdAt: jobs.createdAt, amountCents: jobs.amountCents })
    .from(jobs)
    .where(and(eq(jobs.founderEmail, email.toLowerCase()), eq(jobs.paymentStatus, "paid"), sql`${jobs.id} <> ${exceptJobId}`))
    .orderBy(jobs.createdAt)
    .limit(1);
  return prior ? { id: prior.id, createdAt: prior.createdAt, free: prior.amountCents === 0 } : null;
}
