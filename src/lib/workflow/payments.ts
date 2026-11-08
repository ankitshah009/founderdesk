import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, type Job } from "@/lib/db/schema";
import { env, isLive } from "@/lib/env";
import { createCheckoutSession, stripe } from "@/lib/integrations/stripe";
import { links } from "@/lib/links";
import { enqueue, getJob } from "./store";

/**
 * Create (or reuse) the Checkout Session for a job. The session carries the
 * job ID in metadata and is stored on the job; its success page shows the
 * order. Without Stripe keys, the "checkout" is a clearly-labelled simulated
 * payment page that calls the same fulfillment function.
 */
export async function checkoutUrlFor(job: Job): Promise<string> {
  if (job.paymentStatus === "paid") return links.orderPath(job.id);
  // Price drops apply to unpaid orders: charge the lower of quoted and current.
  const current = env().OFFER_AMOUNT_CENTS;
  if (job.amountCents > current) {
    const db0 = await getDb();
    await db0.update(jobs).set({ amountCents: current, checkoutSessionId: null, checkoutUrl: null }).where(and(eq(jobs.id, job.id), eq(jobs.paymentStatus, "unpaid")));
    job = { ...job, amountCents: current, checkoutSessionId: null, checkoutUrl: null };
  }
  if (!isLive("stripe")) return `/orders/${job.id}/pay?t=${new URL(links.order(job.id)).searchParams.get("t")}`;

  if (job.checkoutSessionId) {
    const existing = await stripe().checkout.sessions.retrieve(job.checkoutSessionId);
    if (existing.status === "open" && existing.url) return existing.url;
    if (existing.status === "complete") return links.order(job.id);
  }
  const db = await getDb();
  const attempt = job.checkoutSessionId ? Date.now() : 0;
  const order = links.order(job.id);
  const session = await createCheckoutSession({
    jobId: job.id,
    founderEmail: job.founderEmail,
    topic: job.topic,
    amountCents: job.amountCents,
    successUrl: `${order}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: order,
    attempt,
  });
  await db.update(jobs).set({ checkoutSessionId: session.id, checkoutUrl: session.url }).where(eq(jobs.id, job.id));
  return session.url!;
}

/**
 * Fulfillment. Safe under repeated and concurrent calls for the same session
 * (webhook retries, the success page, a simulator click): the conditional
 * UPDATE lets exactly one caller flip the job to paid, and only that caller
 * enqueues research and the receipt email.
 */
export async function fulfillPayment(args: { jobId: string; checkoutSessionId: string | null; amountTotal: number | null; discountCents?: number }): Promise<{ fulfilled: boolean; job: Job | null }> {
  const job = await getJob(args.jobId);
  if (!job) return { fulfilled: false, job: null };
  // A Stripe-applied promotion code counts toward the price; anything else short is refused.
  if (args.amountTotal != null && args.amountTotal + (args.discountCents ?? 0) < job.amountCents) {
    throw new Error(`Paid amount ${args.amountTotal} is below the order price ${job.amountCents}`);
  }
  const db = await getDb();
  const [paid] = await db
    .update(jobs)
    .set({
      paymentStatus: "paid",
      paidAt: new Date(),
      stage: "RESEARCHING",
      stageReason: null,
      checkoutSessionId: args.checkoutSessionId ?? job.checkoutSessionId,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.paymentStatus, "unpaid")))
    .returning();
  if (!paid) return { fulfilled: false, job };
  await enqueue(paid.id, "research_plan", `${paid.id}:research_plan`);
  return { fulfilled: true, job: paid };
}
