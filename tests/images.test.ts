import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
const gen = vi.fn();
vi.mock("@/lib/integrations/openai", async (orig) => ({ ...(await orig<object>()), generateImage: (...a: unknown[]) => gen(...a) }));

const { getDb, resetDbForTests } = await import("@/lib/db/client");
const { drafts, images, jobs } = await import("@/lib/db/schema");
const { createJob } = await import("@/lib/workflow/intake");
const { grantImageCredits, requestImage, ImageError, IMAGE_PACK } = await import("@/lib/workflow/images");
const { runWork } = await import("@/lib/workflow/run");
const { getJob } = await import("@/lib/workflow/store");

async function readyJob() {
  const db = await getDb();
  const job = await createJob({ channel: "web", founderEmail: `img${Math.random()}@founder.test`, subject: "Img", body: "I want to write about why pictures help articles. My audience is founders." });
  await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "Why pictures help", dek: "D", bodyMarkdown: "## Why it matters\n\nText.\n\n## Sources\n\n- x", announcement: "A", contentHash: "h" });
  await db.update(jobs).set({ stage: "READY_FOR_APPROVAL" }).where(eq(jobs.id, job.id));
  return job;
}

describe("images add-on", () => {
  afterAll(async () => resetDbForTests());

  it("grants 10 credits once per Checkout Session and rejects underpayment", async () => {
    const job = await readyJob();
    expect(await grantImageCredits(job.id, "cs_img_1", 500)).toBe(true);
    expect(await grantImageCredits(job.id, "cs_img_1", 500)).toBe(false);
    expect((await getJob(job.id))!.imageCredits).toBe(IMAGE_PACK.credits);
    await expect(grantImageCredits(job.id, "cs_img_2", 100)).rejects.toThrow();
  });

  it("spends one credit per image, never below zero, and only for real sections", async () => {
    const job = await readyJob();
    await expect(requestImage(job.id, "hero")).rejects.toBeInstanceOf(ImageError);
    await grantImageCredits(job.id, "cs_img_3", 500);
    await expect(requestImage(job.id, "Not a heading")).rejects.toBeInstanceOf(ImageError);
    await requestImage(job.id, "Why it matters");
    expect((await getJob(job.id))!.imageCredits).toBe(9);
  });

  it("stores the generated image, and refunds the credit when generation fails", async () => {
    const job = await readyJob();
    await grantImageCredits(job.id, "cs_img_4", 500);
    gen.mockResolvedValue({ bytes: Buffer.from("webp-bytes"), mime: "image/webp" });
    await requestImage(job.id, "hero");
    await runWork({ budgetMs: 5_000 });
    const db = await getDb();
    const ok = (await db.select().from(images).where(eq(images.jobId, job.id))).find((r) => r.slot === "hero");
    expect(ok!.status).toBe("ready");
    expect(Buffer.from(ok!.data!).toString()).toBe("webp-bytes");

    gen.mockRejectedValue(Object.assign(new Error("content policy"), { name: "PermanentError" }));
    await requestImage(job.id, "Why it matters");
    expect((await getJob(job.id))!.imageCredits).toBe(8);
    await runWork({ budgetMs: 20_000 });
    const rows = await db.select().from(images).where(eq(images.jobId, job.id));
    expect(rows.find((r) => r.slot === "Why it matters")!.status).toBe("failed");
    expect((await getJob(job.id))!.imageCredits).toBe(9);
  }, 60_000);
});
