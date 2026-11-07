"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DESK_COOKIE, assertDesk } from "@/lib/desk-auth";
import { env, isLive } from "@/lib/env";
import { links } from "@/lib/links";
import { safeEqual, verifyLink } from "@/lib/security";
import { createJob, persistEvent, processInboundEvent, recordFounderReply } from "@/lib/workflow/intake";
import { fulfillPayment } from "@/lib/workflow/payments";
import { GateError, approveDraft, submitFounderEdit } from "@/lib/workflow/publish";
import { kick } from "@/lib/workflow/run";
import { getJob } from "@/lib/workflow/store";

export type ActionState = { error?: string; ok?: string } | null;

const startSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  subject: z.string().trim().min(3, "Give the article a working title").max(160),
  notes: z.string().trim().min(40, "Add a few sentences of notes so we know what to argue").max(20_000),
  links: z.string().trim().max(4000).optional(),
  boundaries: z.string().trim().max(1000).optional(),
});

export async function startArticle(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = startSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const body = [v.notes, v.links ? `\nLinks:\n${v.links}` : "", v.boundaries ? `\n${v.boundaries}` : ""].join("\n");
  const job = await createJob({ channel: "web", founderEmail: v.email, founderName: v.name || null, subject: v.subject, body });
  kick();
  redirect(links.orderPath(job.id));
}

/** Simulated checkout — only available while Stripe is not configured. */
export async function simulatePayment(form: FormData) {
  if (isLive("stripe")) throw new Error("Stripe is configured; use Checkout.");
  const jobId = verifyLink(String(form.get("t") ?? ""), "order");
  if (!jobId) throw new Error("Invalid order link");
  const job = await getJob(jobId);
  if (!job) throw new Error("Order not found");
  await fulfillPayment({ jobId, checkoutSessionId: `sim_${randomUUID()}`, amountTotal: job.amountCents });
  kick();
  redirect(links.orderPath(jobId));
}

export async function approveArticle(_: ActionState, form: FormData): Promise<ActionState> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "review");
  if (!jobId) return { error: "This review link is invalid or has expired." };
  try {
    await approveDraft({
      jobId,
      draftId: String(form.get("draftId")),
      contentHash: String(form.get("contentHash")),
      destinations: form.getAll("destinations").map(String),
    });
  } catch (err) {
    if (err instanceof GateError) return { error: err.message };
    throw err;
  }
  kick();
  refresh();
  return { ok: "Approved. Publishing now — this page will update." };
}

export async function editArticle(_: ActionState, form: FormData): Promise<ActionState> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "review");
  if (!jobId) return { error: "This review link is invalid or has expired." };
  try {
    await submitFounderEdit({
      jobId,
      baseDraftId: String(form.get("draftId")),
      title: String(form.get("title") ?? ""),
      dek: String(form.get("dek") ?? ""),
      bodyMarkdown: String(form.get("body") ?? ""),
      announcement: String(form.get("announcement") ?? ""),
    });
  } catch (err) {
    if (err instanceof GateError) return { error: err.message };
    throw err;
  }
  kick();
  refresh();
  return { ok: "Edits saved as a new version. It goes back through review; you'll get a fresh link." };
}

/* ── Operator desk ────────────────────────────────────────────────────────── */

export async function deskLogin(_: ActionState, form: FormData): Promise<ActionState> {
  const token = env().DESK_TOKEN;
  const given = String(form.get("token") ?? "");
  if (!token || !safeEqual(given, token)) return { error: "That token is not right." };
  (await cookies()).set(DESK_COOKIE, given, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
  redirect("/desk");
}

/**
 * Simulated inbound email: builds a message.received payload and runs it
 * through exactly the same processing path as a verified AgentMail webhook.
 */
export async function simulateInbound(_: ActionState, form: FormData): Promise<ActionState> {
  await assertDesk();
  const from = String(form.get("from") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();
  const threadId = String(form.get("threadId") ?? "").trim() || `sim_thread_${randomUUID().slice(0, 8)}`;
  const attachmentName = String(form.get("attachmentName") ?? "").trim();
  const attachmentText = String(form.get("attachmentText") ?? "").trim();
  if (!from || !text) return { error: "From and message are required." };
  const inbox = env().AGENTMAIL_INBOX_ID ?? "desk@founderdesk.simulated";
  const payload = {
    event_type: "message.received",
    message: {
      inbox_id: inbox,
      thread_id: threadId,
      message_id: `<sim-${randomUUID()}@founderdesk>`,
      from,
      to: [inbox],
      subject: String(form.get("subject") ?? "") || null,
      text,
      extracted_text: text,
      attachments: attachmentText ? [{ attachment_id: "sim_att_1", filename: attachmentName || "attachment.txt", content_type: "text/plain", text: attachmentText }] : [],
    },
  };
  const ev = await persistEvent("simulator", randomUUID(), "message.received", payload);
  if (ev) await processInboundEvent(ev.id);
  kick();
  refresh();
  return { ok: `Delivered to thread ${threadId}.` };
}

export async function deskReply(_: ActionState, form: FormData): Promise<ActionState> {
  await assertDesk();
  const job = await getJob(String(form.get("jobId")));
  const text = String(form.get("text") ?? "").trim();
  if (!job || !text) return { error: "Reply text is required." };
  await recordFounderReply(job, { text });
  kick();
  refresh();
  return { ok: "Reply recorded on the job." };
}

export async function deskRun(): Promise<void> {
  await assertDesk();
  kick();
}
