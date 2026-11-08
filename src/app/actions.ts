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
  subject: z.string().trim().max(160).optional(),
  notes: z.string().trim().min(40, "Add a few sentences of notes so we know what to argue").max(20_000),
  links: z.string().trim().max(4000).optional(),
  boundaries: z.string().trim().max(1000).optional(),
});

export type IdeasState = { error?: string; url?: string; result?: import("@/lib/ideas").Ideas } | null;

const ideaHits = new Map<string, number[]>();

/** Step 1 of the website start: read the site and suggest arguments. */
export async function suggestIdeasAction(_: IdeasState, form: FormData): Promise<IdeasState> {
  const url = String(form.get("website") ?? "").trim();
  const note = String(form.get("note") ?? "").trim() || null;
  if (url.length < 4 || !/\./.test(url)) return { error: "Enter your company website, like acme.com." };
  // Light abuse guard: 6 suggestion runs per visitor per 10 minutes.
  const { headers } = await import("next/headers");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const hits = (ideaHits.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (hits.length >= 6) return { error: "That's a lot of suggestions — pick one, or write your own angle below.", url };
  ideaHits.set(ip, [...hits, now]);
  try {
    const { suggestIdeas } = await import("@/lib/ideas");
    return { url, result: await suggestIdeas({ url, note }) };
  } catch (err) {
    const msg = (err as Error).message;
    return { url, error: /couldn't read|aren't available|Refusing|Unsupported/.test(msg) ? msg.replace(/^Refusing.*/, "That address can't be read from here.") : "We couldn't suggest ideas for that site just now. Try again, or write your own angle below." };
  }
}

const ideaStartSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  name: z.string().trim().max(120).optional(),
  website: z.string().trim().min(4).max(300),
  pick: z.string().min(2).max(5000),
  angle: z.string().trim().max(4000).optional(),
});

/** Step 2: start the order from a picked idea. */
export async function startFromIdea(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = ideaStartSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const { briefFromIdea, ideasSchema } = await import("@/lib/ideas");
  let picked: { company: import("@/lib/ideas").Ideas["company"]; idea: import("@/lib/ideas").Ideas["ideas"][number] };
  try {
    const raw = JSON.parse(v.pick) as { company: unknown; idea: unknown };
    picked = { company: ideasSchema.shape.company.parse(raw.company), idea: ideasSchema.shape.ideas.element.parse(raw.idea) };
  } catch {
    return { error: "Pick one of the ideas first." };
  }
  const brief = briefFromIdea({ url: v.website, company: picked.company, idea: picked.idea, angle: v.angle });
  const job = await createJob({ channel: "web", founderEmail: v.email, founderName: v.name || null, subject: brief.subject, body: brief.body });
  kick();
  redirect(links.orderPath(job.id));
}

export async function startArticle(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = startSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const body = [v.notes, v.links ? `\nLinks:\n${v.links}` : "", v.boundaries ? `\n${v.boundaries}` : ""].join("\n");
  const job = await createJob({ channel: "web", founderEmail: v.email, founderName: v.name || null, subject: v.subject || null, body });
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
      xFormat: form.get("xFormat") === "single" ? "single" : "thread",
      imageIds: form.getAll("imageIds").map(String),
      schedule:
        form.get("when") === "later"
          ? Object.fromEntries(
              [...form.entries()]
                .filter(([k, v]) => k.startsWith("at_") && String(v))
                .map(([k, v]) => [k.slice(3), new Date(String(v))]),
            )
          : undefined,
    });
  } catch (err) {
    if (err instanceof GateError) return { error: err.message };
    throw err;
  }
  kick();
  refresh();
  return { ok: form.get("when") === "later" ? "Approved and scheduled. You can publish early or cancel from your order page." : "Approved. Publishing now — this page will update." };
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

/* ── Customer sign-in (see src/lib/auth.ts for the security model) ────────── */

export type SignInState = { error?: string; step?: "code"; email?: string } | null;

export async function requestSignIn(_: SignInState, form: FormData): Promise<SignInState> {
  const { AuthError, startChallenge } = await import("@/lib/auth");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  try {
    await startChallenge(email);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }
  // Same answer whether or not the address has orders.
  return { step: "code", email };
}

export async function verifySignInCode(_: SignInState, form: FormData): Promise<SignInState> {
  const { AuthError, consumeCode, createSession } = await import("@/lib/auth");
  const email = String(form.get("email") ?? "");
  try {
    await createSession(await consumeCode(email, String(form.get("code") ?? "").replace(/\s/g, "")));
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message, step: "code", email };
    throw err;
  }
  redirect("/account");
}

export async function confirmSignInLink(form: FormData) {
  const { AuthError, consumeLink, createSession } = await import("@/lib/auth");
  try {
    await createSession(await consumeLink(String(form.get("c") ?? ""), String(form.get("t") ?? "")));
  } catch (err) {
    if (err instanceof AuthError) redirect("/signin?expired=1");
    throw err;
  }
  redirect("/account");
}

export async function signOutAction(form: FormData) {
  const { signOut } = await import("@/lib/auth");
  await signOut(form.get("everywhere") === "1");
  redirect("/signin");
}

/** Claim the free first article — only reachable from the emailed link. */
export async function claimFreeArticle(form: FormData) {
  const jobId = verifyLink(String(form.get("t") ?? ""), "free");
  if (!jobId) throw new Error("This link is invalid or has expired.");
  const { claimFree } = await import("@/lib/workflow/intake");
  if (await claimFree(jobId)) kick();
  redirect(links.orderPath(jobId));
}

/** Order page: email the confirm link again. */
export async function resendStartLink(_: ActionState, form: FormData): Promise<ActionState> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "order");
  if (!jobId) return { error: "This link is invalid or has expired." };
  const { resendStartEmail } = await import("@/lib/workflow/intake");
  const res = await resendStartEmail(jobId);
  if (res === "limit") return { error: "We've sent it a few times already. Check spam, or reply to any of our emails." };
  if (res === "sent") kick();
  return { ok: "Sent. It usually arrives within a minute." };
}

export async function deskRetry(form: FormData): Promise<void> {
  await assertDesk();
  const { retryJob } = await import("@/lib/workflow/store");
  await retryJob(String(form.get("jobId")));
  kick();
  refresh();
}

export async function generateImageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "review");
  if (!jobId) return { error: "This link is invalid or has expired." };
  const { ImageError, requestImage } = await import("@/lib/workflow/images");
  try {
    await requestImage(jobId, String(form.get("slot") ?? "hero"));
  } catch (err) {
    if (err instanceof ImageError) return { error: err.message };
    throw err;
  }
  kick();
  refresh();
  return { ok: "Generating — it appears here in about 30 seconds." };
}

export async function declineImages(form: FormData): Promise<void> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "review");
  if (!jobId) return;
  const { getDb } = await import("@/lib/db/client");
  const { jobs } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  await db.update(jobs).set({ imagesDeclined: true }).where(eq(jobs.id, jobId));
  refresh();
}

/** Order page: publish a scheduled article right away, or cancel the schedule. */
export async function scheduleAction(form: FormData): Promise<void> {
  const jobId = verifyLink(String(form.get("t") ?? ""), "order");
  if (!jobId) throw new Error("This link is invalid or has expired.");
  const { cancelSchedule, publishNow } = await import("@/lib/workflow/publish");
  if (form.get("op") === "now") {
    if (await publishNow(jobId)) kick();
  } else {
    await cancelSchedule(jobId);
  }
  refresh();
}
