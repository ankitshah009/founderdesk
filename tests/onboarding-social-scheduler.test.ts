import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn(), connection: async () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "10.9.9.9", "user-agent": "vitest" }),
}));
const runTask = vi.fn();
const getTaskStatus = vi.fn();
vi.mock("@/lib/integrations/mobilerun", async (orig) => ({ ...(await orig<object>()), runTask: (...a: unknown[]) => runTask(...a), getTaskStatus: (...a: unknown[]) => getTaskStatus(...a) }));

const { getDb, resetDbForTests } = await import("@/lib/db/client");
const { approvals, authChallenges, dispatches, drafts, jobs, publications, reviews } = await import("@/lib/db/schema");
const { landingAfterSignIn, onboardingDone } = await import("@/lib/studio/gate");
const { updateProfile } = await import("@/lib/studio/store");
const { startChallenge, consumeLinkDetails } = await import("@/lib/auth");
const { createJob } = await import("@/lib/workflow/intake");
const { approveDraft, GateError } = await import("@/lib/workflow/publish");
const { connectViaMobileRun } = await import("@/lib/social/accounts");
const { enqueue } = await import("@/lib/workflow/store");
const { runWork } = await import("@/lib/workflow/run");
const sched = await import("@/lib/workflow/scheduler");

afterAll(async () => resetDbForTests());

const brand = { name: "Acme", tagline: null, description: "Support tooling", website: "https://acme.test", logoUrl: null, colors: [], audience: null, products: [], keyTerms: [] };

describe("sign-in landing and onboarding gate", () => {
  it("sends new founders to onboarding before the Studio or an article, but not before orders", async () => {
    const email = "new@gate.test";
    expect(await landingAfterSignIn(email, "/studio")).toBe("/studio/onboarding?next=%2Fstudio");
    expect(await landingAfterSignIn(email, "/start")).toBe("/studio/onboarding?next=%2Fstart");
    expect(await landingAfterSignIn(email, "/account")).toBe("/account");
    expect(await landingAfterSignIn(email, "https://evil.test")).toBe("/studio/onboarding?next=%2Fstudio");
    expect(await landingAfterSignIn(email, "//evil.test/studio")).toBe("/studio/onboarding?next=%2Fstudio");
  });

  it("counts onboarding as done only when the brand is captured, not by skipping", async () => {
    expect(onboardingDone({ onboardedAt: new Date(), brand: null })).toBe(false);
    expect(onboardingDone({ onboardedAt: null, brand: brand as never })).toBe(false);
    const email = "done@gate.test";
    await updateProfile(email, { brand: brand as never, onboardedAt: new Date() });
    expect(await landingAfterSignIn(email, "/start")).toBe("/start");
  });

  it("the emailed link carries where to land and sign-up details, saved only after verification", async () => {
    const res = await startChallenge("link@gate.test", { allowNew: true, deliver: false, next: "/studio/onboarding", meta: { name: "Lin", website: "acme.test" } });
    const db = await getDb();
    const [row] = await db.select().from(authChallenges).where(eq(authChallenges.id, res.challengeId!));
    expect(row!.next).toBe("/studio/onboarding");
    const token = new URL(res.link!).searchParams.get("t")!;
    const got = await consumeLinkDetails(res.challengeId!, token);
    expect(got).toEqual({ email: "link@gate.test", next: "/studio/onboarding", meta: { name: "Lin", website: "acme.test" } });
    await expect(consumeLinkDetails(res.challengeId!, token)).rejects.toThrow();
  });
});

async function approvedJob(tag: string, destinations: string[], schedule?: Record<string, Date | null>) {
  const db = await getDb();
  const job = await createJob({ channel: "web", founderEmail: `${tag}@phone.test`, subject: tag, body: "I want to write about why phones post better. My audience is founders." });
  const [d] = await db
    .insert(drafts)
    .values({ jobId: job.id, version: 1, author: "writer", title: `T ${tag}`, dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A {{url}}", contentHash: `h-${tag}`, variants: { x: ["Hook post", "Last post {{url}}"], xSingle: "One post {{url}}", linkedin: "LinkedIn text {{url}}" } })
    .returning();
  await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
  await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
  for (const p of destinations) await connectViaMobileRun(job.founderEmail, p as never, `@${tag}`);
  await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: d!.contentHash, destinations, xFormat: "thread", schedule });
  return { db, job, draft: d! };
}

describe("posting through the Mobile Run phone", () => {
  it("posts an X thread from the phone and records it only with a real post link", async () => {
    const { db, job, draft } = await approvedJob("xphone", ["x"]);
    // The article is already live; queue the X post directly.
    await db.insert(publications).values({ jobId: job.id, draftId: draft.id, approvalId: (await db.select().from(approvals).where(eq(approvals.jobId, job.id)))[0]!.id, destination: "web", slug: "t", url: "https://desk.test/a/t", contentHash: draft.contentHash, status: "published" });
    runTask.mockResolvedValue({ id: "task_x_1", status: "queued", streamUrl: null });
    getTaskStatus.mockResolvedValue({ status: "completed", succeeded: true, output: { posted: true, postUrl: "https://x.com/xphone/status/123", problems: [] } });
    await enqueue(job.id, "publish", `${job.id}:publish:x:${draft.id}`, { destination: "x", draftId: draft.id });
    await runWork({ budgetMs: 25_000 });
    const task = String(runTask.mock.calls.at(-1)![0].task);
    expect(task).toContain("thread of 2 posts");
    expect(task).toContain("Last post https://desk.test/a/t");
    const [pub] = await db.select().from(publications).where(and(eq(publications.jobId, job.id), eq(publications.destination, "x")));
    expect(pub!.status).toBe("published");
    expect(pub!.url).toBe("https://x.com/xphone/status/123");
  });

  it("refuses a finished phone task without a valid LinkedIn post link", async () => {
    const { db, job, draft } = await approvedJob("liphone", ["linkedin"]);
    await db.insert(publications).values({ jobId: job.id, draftId: draft.id, approvalId: (await db.select().from(approvals).where(eq(approvals.jobId, job.id)))[0]!.id, destination: "web", slug: "t2", url: "https://desk.test/a/t2", contentHash: draft.contentHash, status: "published" });
    runTask.mockResolvedValue({ id: "task_li_1", status: "queued", streamUrl: null });
    getTaskStatus.mockResolvedValue({ status: "completed", succeeded: true, output: { posted: true, postUrl: "https://example.com/not-a-post", problems: [] } });
    await enqueue(job.id, "publish", `${job.id}:publish:linkedin:${draft.id}`, { destination: "linkedin", draftId: draft.id });
    await runWork({ budgetMs: 25_000 });
    const [pub] = await db.select().from(publications).where(and(eq(publications.jobId, job.id), eq(publications.destination, "linkedin")));
    expect(pub!.status).toBe("failed");
  });
});

describe("scheduler", () => {
  it("lists, moves and removes only the founder's own queued posts; a post never precedes its article", async () => {
    const web = new Date(Date.now() + 5 * 3_600_000);
    const { db, job } = await approvedJob("sched", ["x", "linkedin"], { web, x: new Date(Date.now() + 6 * 3_600_000), linkedin: new Date(Date.now() + 7 * 3_600_000) });
    const q = await sched.upcomingFor(job.founderEmail);
    expect(q.map((i) => i.destination)).toEqual(["web", "x", "linkedin"]);

    // Someone else can't touch it.
    await expect(sched.cancelPost("other@phone.test", job.id, "x")).rejects.toBeInstanceOf(GateError);

    // Moving X before the article clamps it to the article time.
    const moved = await sched.reschedule(job.founderEmail, job.id, "x", new Date(Date.now() + 3_600_000));
    expect(moved.getTime()).toBe(web.getTime());

    // Moving the article later pulls posts with it.
    const later = new Date(Date.now() + 9 * 3_600_000);
    await sched.reschedule(job.founderEmail, job.id, "web", later);
    const rows = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
    for (const r of rows) expect(r.scheduledAt!.getTime()).toBeGreaterThanOrEqual(later.getTime());
    const [webDispatch] = await db.select().from(dispatches).where(eq(dispatches.requestKey, `${job.id}:publish:web:${rows[0]!.draftId}`));
    expect(webDispatch!.nextRunAt.getTime()).toBe(later.getTime());

    // Removing LinkedIn withdraws its approval and destination.
    await sched.cancelPost(job.founderEmail, job.id, "linkedin");
    expect((await db.select().from(approvals).where(and(eq(approvals.jobId, job.id), eq(approvals.destination, "linkedin")))).length).toBe(0);
    const [j] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(j!.destinations).not.toContain("linkedin");
    expect((await sched.upcomingFor(job.founderEmail)).map((i) => i.destination)).toEqual(["web", "x"]);
  });
});

describe("WorkOS switch", () => {
  it("stays off until all three keys are set, with a strong cookie password", async () => {
    const { workosEnabled } = await import("@/lib/workos");
    const saved = { ...process.env };
    try {
      delete process.env.WORKOS_API_KEY;
      process.env.WORKOS_CLIENT_ID = "client_x";
      process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(40);
      expect(workosEnabled()).toBe(false);
      process.env.WORKOS_API_KEY = "sk_test_x";
      process.env.WORKOS_COOKIE_PASSWORD = "short";
      expect(workosEnabled()).toBe(false);
      process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(40);
      expect(workosEnabled()).toBe(true);
    } finally {
      for (const k of ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
