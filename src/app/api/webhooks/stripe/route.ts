import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { providerEvents } from "@/lib/db/schema";
import { verifyStripeWebhook } from "@/lib/integrations/stripe";
import { persistEvent } from "@/lib/workflow/intake";
import { fulfillPayment } from "@/lib/workflow/payments";
import { kick } from "@/lib/workflow/run";

export const maxDuration = 60;

/**
 * Stripe fulfillment webhook:
 *   1. verify the signature against the raw body
 *   2. record the event (deduplicated on Stripe's event id)
 *   3. fulfil — idempotent under repeated and concurrent deliveries
 *   4. return promptly; research runs after the response
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhook(raw, req.headers.get("stripe-signature"));
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  const recorded = await persistEvent("stripe", event.id, event.type, event);
  const db = await getDb();
  if (!recorded) {
    const [prior] = await db.select().from(providerEvents).where(eq(providerEvents.externalId, event.id)).limit(1);
    // A redelivery of an event we already processed: acknowledge.
    if (prior?.status !== "failed") return NextResponse.json({ received: true, duplicate: true });
  }
  const eventRow = recorded ?? (await db.select().from(providerEvents).where(eq(providerEvents.externalId, event.id)).limit(1))[0]!;

  const mark = (status: "processed" | "ignored" | "failed", note: string, jobId?: string) =>
    db.update(providerEvents).set({ status, note, jobId: jobId ?? null, processedAt: new Date() }).where(eq(providerEvents.id, eventRow.id));

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    await mark("ignored", `unhandled ${event.type}`);
    return NextResponse.json({ received: true });
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const jobId = session.metadata?.job_id;
  if (!jobId) {
    await mark("ignored", "no job_id in metadata");
    return NextResponse.json({ received: true });
  }
  if (session.payment_status !== "paid") {
    await mark("ignored", `payment_status ${session.payment_status}`, jobId);
    return NextResponse.json({ received: true });
  }
  if (session.metadata?.addon === "images_10") {
    try {
      const { grantImageCredits } = await import("@/lib/workflow/images");
      const granted = await grantImageCredits(jobId, session.id, session.amount_total);
      await mark("processed", granted ? "image credits granted" : "image credits already granted", jobId);
      return NextResponse.json({ received: true });
    } catch (err) {
      await mark("failed", (err as Error).message.slice(0, 500), jobId);
      return NextResponse.json({ error: "grant failed" }, { status: 500 });
    }
  }
  try {
    const res = await fulfillPayment({ jobId, checkoutSessionId: session.id, amountTotal: session.amount_total });
    await mark("processed", res.fulfilled ? "fulfilled" : "already fulfilled", jobId);
    kick();
    return NextResponse.json({ received: true });
  } catch (err) {
    await mark("failed", (err as Error).message.slice(0, 500), jobId);
    // 500 so Stripe retries; the event row lets the retry pick up where we left off.
    return NextResponse.json({ error: "fulfillment failed" }, { status: 500 });
  }
}
