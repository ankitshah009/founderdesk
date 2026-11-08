import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, outboundMessages, type Job, type OutboundMessage, type QualityScores } from "@/lib/db/schema";
import { env, isLive } from "@/lib/env";
import { replyToMessage, sendMessage } from "@/lib/integrations/agentmail";
import { links } from "@/lib/links";

/**
 * Every message to the founder is a row first (with a stable request key so
 * it is never sent twice), then delivered. Without AgentMail credentials the
 * row is marked "simulated" and shown in the outbox instead of being sent.
 */

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const hello = (job: Job) => (job.founderName ? `Hi ${job.founderName.split(" ")[0]},` : "Hi,");
const subjectFor = (job: Job) => `Re: ${job.topic}`;
/** A parsed thesis is only shown if it reads like a claim, not a fragment. */
export const usableThesis = (job: Job) => {
  const t = (job.thesis ?? "").trim();
  return t.split(/\s+/).length >= 5 && !/^(an?|the)?\s*(article|post|essay|piece)\b/i.test(t) ? t : null;
};

export const templates = {
  acknowledgement(job: Job & { freeEligible?: boolean }) {
    return {
      subject: subjectFor(job),
      text: [
        hello(job),
        "",
        "We have your brief. Here is exactly what we will deliver:",
        "",
        usableThesis(job) ? `• One researched article arguing: ${usableThesis(job)}` : `• One researched article on: ${job.topic}`,
        `• Written for: ${job.audience ?? "the audience you described"}`,
        "• Every factual claim linked to a source, and a reviewer check against those sources",
        "• A short announcement to share it",
        "• Nothing is published until you approve the exact text on a private review page",
        "",
        job.boundaries.length ? `We will respect: ${job.boundaries.join("; ")}` : null,
        job.sourceUrls.length ? `Sources you sent: ${job.sourceUrls.join(", ")}` : null,
        "",
        ...(job.freeEligible
          ? ["Your first article is free. Confirm and start: " + links.free(job.id), "", "Or just reply to this email: your reply confirms it's you and starts research. Anything you add goes into the article."]
          : [`Price: ${money(job.amountCents)} for this article. Pay here to start research:`, links.checkout(job.id)]),
        "",
        `Track your order: ${links.order(job.id)}`,
        `All your orders: ${links.signin()}`,
        "",
        "Reply to this email at any time; replies are attached to this order.",
        "— FounderDesk",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    };
  },
  payment_received(job: Job) {
    return {
      subject: subjectFor(job),
      text: `${hello(job)}\n\nPayment received — research has started. We will email you if we need anything, and again when the article is ready for your review.\n\nOrder: ${links.order(job.id)}\n\n— FounderDesk`,
    };
  },
  question(job: Job, questions: string[]) {
    return {
      subject: subjectFor(job),
      text: `${hello(job)}\n\nYour draft is written. Before it's final, our reviewer needs one answer from you:\n\n${questions.map((q) => `• ${q}`).join("\n")}\n\nJust reply to this email (attach a report or data if you have one). You can read the current draft here:\n${links.review(job.id)}\n\n— FounderDesk`,
    };
  },
  still_waiting(job: Job, questions: string[]) {
    return {
      subject: subjectFor(job),
      text: `${hello(job)}\n\nThanks — we saved your reply. We still need an answer to this before the article can move on:\n\n${questions.map((q) => `• ${q}`).join("\n")}\n\n— FounderDesk`,
    };
  },
  review_link(job: Job, extra: { scores?: QualityScores | null; notes?: string[]; corrections?: string[] } = {}) {
    const attention = [
      ...(extra.corrections ?? []).slice(0, 3).map((c) => `• Correction: ${c}`),
      ...(extra.notes ?? []).slice(0, 3).map((n) => `• Reviewer note: ${n}`),
      ...(extra.scores?.suggestions ?? []).slice(0, 2).map((s) => `• To raise the score: ${s}`),
    ];
    return {
      subject: `Ready for your approval: ${job.topic}`.slice(0, 120),
      text: [
        hello(job),
        "",
        "Your article is ready for review. The page shows the finished article, the corrections we made, and the source beside each claim:",
        "",
        links.review(job.id),
        "",
        ...(extra.scores ? [`Quality score: ${extra.scores.overall}/100 (accuracy ${extra.scores.accuracy}, sources ${extra.scores.sources}, readability ${extra.scores.readability}${extra.scores.voice != null ? `, voice match ${extra.scores.voice}` : ""}).`, ""] : []),
        ...(attention.length ? ["What needs your attention:", ...attention, ""] : ["Nothing needs your attention beyond reading it through.", ""]),
        "Nothing goes live until you press Approve. Highlight any passage on that page to ask for a change, or edit the text directly; changes go back through review.",
        "",
        "Want images with it? Add 10 image credits for $5 from the same page.",
        "",
        "— FounderDesk",
      ].join("\n"),
    };
  },
  published(job: Job, url: string) {
    return {
      subject: subjectFor(job),
      text: `${hello(job)}\n\nIt's live: ${url}\n\nWe fetched the page to confirm the approved version is being served. A phone check is running now; the result will appear on your order page:\n${links.order(job.id)}\n\n— FounderDesk`,
    };
  },
} as const;

export async function queueMessage(job: Job, kind: OutboundMessage["kind"], requestKey: string, content: { subject: string; text: string }) {
  const db = await getDb();
  const [row] = await db
    .insert(outboundMessages)
    .values({ jobId: job.id, kind, requestKey, toAddress: job.founderEmail, subject: content.subject, text: content.text })
    .onConflictDoNothing({ target: outboundMessages.requestKey })
    .returning();
  return row ?? null;
}

/** Deliver pending messages. Safe to call concurrently: each row is claimed. */
export async function deliverOutbound(limit = 10): Promise<number> {
  const db = await getDb();
  const live = isLive("agentmail");
  const pending = await db
    .select()
    .from(outboundMessages)
    .where(eq(outboundMessages.state, "pending"))
    .orderBy(asc(outboundMessages.createdAt))
    .limit(limit);
  let delivered = 0;
  for (const msg of pending) {
    // Claim: only one worker moves a given row out of its current state.
    const [claimed] = await db
      .update(outboundMessages)
      .set({ state: live ? "sent" : "simulated", sentAt: new Date() })
      .where(and(eq(outboundMessages.id, msg.id), inArray(outboundMessages.state, ["pending", "failed"])))
      .returning();
    if (!claimed) continue;
    if (!live) {
      delivered++;
      continue;
    }
    try {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, msg.jobId)).limit(1);
      const inboxId = job?.inboxId ?? env().AGENTMAIL_INBOX_ID!;
      const res = job?.lastMessageId
        ? await replyToMessage({ inboxId, messageId: job.lastMessageId, text: msg.text, labels: ["founderdesk", msg.kind] })
        : await sendMessage({ inboxId, to: msg.toAddress, subject: msg.subject, text: msg.text, labels: ["founderdesk", msg.kind] });
      await db.update(outboundMessages).set({ providerMessageId: res.message_id }).where(eq(outboundMessages.id, msg.id));
      if (job && !job.threadId && res.thread_id) {
        // Web-form jobs get their email thread on the first message we send.
        await db.update(jobs).set({ threadId: res.thread_id, inboxId }).where(and(eq(jobs.id, job.id), isNull(jobs.threadId)));
      }
      delivered++;
    } catch (err) {
      await db.update(outboundMessages).set({ state: "failed", sentAt: null, error: String(err).slice(0, 500) }).where(eq(outboundMessages.id, msg.id));
    }
  }
  return delivered;
}
