import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { imageCreditGrants, images, jobs } from "@/lib/db/schema";
import { generateImage } from "@/lib/integrations/openai";
import { PermanentError, registerHandler } from "./engine";
import { enqueue, getJob, latestDraft } from "./store";

/** The add-on: 10 image credits for $5. */
export const IMAGE_PACK = { credits: 10, cents: 500 } as const;

/** Grant a pack once per Checkout Session, however often the webhook fires. */
export async function grantImageCredits(jobId: string, checkoutSessionId: string, amountCents: number | null): Promise<boolean> {
  if (amountCents != null && amountCents < IMAGE_PACK.cents) throw new Error(`Image pack paid ${amountCents}, expected ${IMAGE_PACK.cents}`);
  const db = await getDb();
  const [grant] = await db
    .insert(imageCreditGrants)
    .values({ checkoutSessionId, jobId, credits: IMAGE_PACK.credits, amountCents: amountCents ?? IMAGE_PACK.cents })
    .onConflictDoNothing()
    .returning();
  if (!grant) return false;
  await db.update(jobs).set({ imageCredits: sql`${jobs.imageCredits} + ${IMAGE_PACK.credits}` }).where(eq(jobs.id, jobId));
  return true;
}

export class ImageError extends Error {}

/**
 * Spend one credit (atomically) and queue generation for a slot: "hero" or a
 * section heading from the current draft.
 */
export async function requestImage(jobId: string, slot: string): Promise<void> {
  const job = await getJob(jobId);
  const draft = await latestDraft(jobId);
  if (!job || !draft) throw new ImageError("There's no draft to illustrate yet.");
  if (!["READY_FOR_APPROVAL", "WAITING_FOR_FOUNDER", "REVIEWING", "WRITING"].includes(job.stage)) throw new ImageError("Images can be added before the article is approved.");
  const headings = [...draft.bodyMarkdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!.trim()).filter((h) => !/^sources$/i.test(h));
  if (slot !== "hero" && !headings.includes(slot)) throw new ImageError("That section isn't in the current draft.");
  const db = await getDb();
  const [spent] = await db
    .update(jobs)
    .set({ imageCredits: sql`${jobs.imageCredits} - 1` })
    .where(and(eq(jobs.id, jobId), gt(jobs.imageCredits, 0)))
    .returning();
  if (!spent) throw new ImageError("No image credits left. Add a pack to generate more.");
  const prompt =
    slot === "hero"
      ? `Editorial header illustration for an article titled "${draft.title}". ${draft.dek} Calm, modern, conceptual; no text, no logos, no real people's faces.`
      : `Editorial illustration for the section "${slot}" of an article titled "${draft.title}". Conceptual and understated; no text, no logos, no real people's faces.`;
  const [img] = await db.insert(images).values({ jobId, slot, prompt }).returning();
  await enqueue(jobId, "image", `${jobId}:image:${img!.id}`, { imageId: img!.id, slot });
}

registerHandler("image", {
  pollEveryMs: 4_000,
  async start(d) {
    const db = await getDb();
    const [img] = await db.select().from(images).where(eq(images.id, String(d.input.imageId))).limit(1);
    if (!img) throw new PermanentError("Image row not found");
    const out = await generateImage(img.prompt);
    await db.update(images).set({ status: "ready", mime: out.mime, data: out.bytes }).where(eq(images.id, img.id));
    return { done: { imageId: img.id, bytes: out.bytes.byteLength } };
  },
  async complete() {},
  async fail(d, reason) {
    // Refund the credit: a failed generation must not cost the founder.
    const db = await getDb();
    await db.update(images).set({ status: "failed", error: reason.slice(0, 300) }).where(eq(images.id, String(d.input.imageId)));
    await db.update(jobs).set({ imageCredits: sql`${jobs.imageCredits} + 1` }).where(eq(jobs.id, d.jobId));
  },
});
