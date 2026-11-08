import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | undefined;

export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { appInfo: { name: "FounderDesk" } });
  return client;
}

export async function createCheckoutSession(args: {
  jobId: string;
  founderEmail: string;
  topic: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  attempt: number;
}) {
  const priceId = env().STRIPE_PRICE_ID;
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: args.founderEmail,
      client_reference_id: args.jobId,
      metadata: { job_id: args.jobId },
      payment_intent_data: { metadata: { job_id: args.jobId } },
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: args.amountCents,
                product_data: {
                  name: "FounderDesk — researched, reviewed, published article",
                  description: args.topic.slice(0, 200),
                },
              },
            },
      ],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
    // Idempotent per job and attempt: a double-clicked "Pay" reuses the session.
    { idempotencyKey: `checkout:${args.jobId}:${args.attempt}` },
  );
}

export async function verifyStripeWebhook(rawBody: string, signature: string | null): Promise<Stripe.Event> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing stripe-signature header");
  return stripe().webhooks.constructEventAsync(rawBody, signature, secret);
}

/** Checkout for the images add-on: 10 credits for $5, tied to one order. */
export async function createImagePackCheckout(args: { jobId: string; founderEmail: string; successUrl: string; cancelUrl: string }) {
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: args.founderEmail,
      client_reference_id: args.jobId,
      metadata: { job_id: args.jobId, addon: "images_10" },
      payment_intent_data: { metadata: { job_id: args.jobId, addon: "images_10" } },
      line_items: [
        { quantity: 1, price_data: { currency: "usd", unit_amount: 500, product_data: { name: "FounderDesk images — 10 credits", description: "Header and section images for your article" } } },
      ],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
    { idempotencyKey: `images:${args.jobId}:${Math.floor(Date.now() / 600_000)}` },
  );
}
