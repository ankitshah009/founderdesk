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
  // Make sure the launch promo code exists; never block checkout on it.
  await ensureLaunchPromo().catch((err) => console.error("[founderdesk] launch promo setup failed", (err as Error).message));
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
      // Launch promo codes (e.g. FIRST100) are entered on Stripe's page and validated by Stripe.
      allow_promotion_codes: true,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
    // Idempotent per job and attempt: a double-clicked "Pay" reuses the session.
    { idempotencyKey: `checkout:v2:${args.jobId}:${args.attempt}` },
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

/**
 * Launch promo: code FIRST100 = one article free for the first 100 founders
 * (100% off once, 100 redemptions total). Created in Stripe on first use with
 * the deployment's own key and remembered in app_settings, so it exists in
 * whichever Stripe account (sandbox or live) the app is connected to. Stripe
 * itself enforces the 100-use cap.
 */
export const LAUNCH_PROMO = { code: "FIRST100", maxRedemptions: 100 } as const;

export async function ensureLaunchPromo(): Promise<void> {
  const { getDb } = await import("@/lib/db/client");
  const { appSettings } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const key = "stripe_promo_first100";
  const [done] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (done) return;
  const s = stripe();
  const existing = await s.promotionCodes.list({ code: LAUNCH_PROMO.code, limit: 1 });
  let id = existing.data[0]?.id;
  if (!id) {
    const coupon = await s.coupons.create(
      { name: "First 100 founders: one article free", percent_off: 100, duration: "once", metadata: { campaign: "first100" } },
      { idempotencyKey: "fd-coupon-first100-v1" },
    );
    const promo = await s.promotionCodes.create(
      { promotion: { type: "coupon", coupon: coupon.id }, code: LAUNCH_PROMO.code, max_redemptions: LAUNCH_PROMO.maxRedemptions, metadata: { campaign: "first100" } },
      { idempotencyKey: "fd-promo-first100-v1" },
    );
    id = promo.id;
  }
  await db.insert(appSettings).values({ key, value: { id } }).onConflictDoNothing();
}
