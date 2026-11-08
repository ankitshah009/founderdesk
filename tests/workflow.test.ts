import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { approvals, dispatches, drafts, jobs, outboundMessages, publications, reviews } from "@/lib/db/schema";
import { approveDraft, GateError, submitFounderEdit } from "@/lib/workflow/publish";
import { persistEvent, processInboundEvent } from "@/lib/workflow/intake";
import { fulfillPayment } from "@/lib/workflow/payments";
import { runWork } from "@/lib/workflow/run";
import { enqueue, getJob, latestDraft } from "@/lib/workflow/store";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const FOUNDER = "Dana Reyes <dana@northwind.dev>";
const INBOX = "desk@agentmail.to";
const THREAD = "thd_123";

const NOTES = `Hi team,

I want to write about why founders should start with narrow support workflows. My audience is early-stage SaaS founders. Please keep the customer names private.

Notes:
- We piloted with Acme Robotics and saw first-response time improved by 80% in six weeks.
- Narrow AI support workflows work for all companies, according to the pilot report.
- Starting with password resets and refunds kept escalation rates low for our team.

Thanks,
Dana`;

const PILOT_REPORT = `Pilot report: AI-assisted support triage.
Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60% after routing password resets and refund requests to narrow AI workflows.
Companies that automated every ticket type at once saw escalation rates rise by 12% during the same period.
The pilot was limited to companies with fewer than 200 employees, so results may not generalize to larger support organizations.
Narrow AI support workflows reduced first-response time for the companies in the pilot without increasing escalations.`;

async function inbound(text: string, opts: { subject?: string; attachments?: Array<{ filename: string; text: string }> } = {}) {
  const payload = {
    event_type: "message.received",
    message: {
      inbox_id: INBOX,
      thread_id: THREAD,
      message_id: `<${randomUUID()}@mail>`,
      from: FOUNDER,
      to: [INBOX],
      subject: opts.subject ?? "Article on AI customer support",
      text,
      extracted_text: text,
      attachments: (opts.attachments ?? []).map((a, i) => ({ attachment_id: `att_${i}`, filename: a.filename, content_type: "text/plain", text: a.text })),
    },
  };
  const ev = await persistEvent("simulator", randomUUID(), "message.received", payload);
  await processInboundEvent(ev!.id);
}

/** Stand-in for the public web: render the published page from the database. */
function stubPublicWeb() {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://founderdesk.test/a/")) return real(input as never, init);
    const slug = url.split("/a/")[1]!;
    const db = await getDb();
    const [pub] = await db.select().from(publications).where(eq(publications.slug, slug));
    if (!pub) return new Response("not found", { status: 404 });
    const [d] = await db.select().from(drafts).where(eq(drafts.id, pub.draftId));
    return new Response(
      `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="founderdesk:content-hash" content="${pub.contentHash}"></head><body><h1>${d!.title}</h1><section id="sources"><a href="https://example.com/report">Report</a></section></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  });
}

async function outbox(jobId: string) {
  const db = await getDb();
  return db.select().from(outboundMessages).where(eq(outboundMessages.jobId, jobId));
}

describe("FounderDesk workflow (simulated providers, real Postgres via PGlite)", () => {
  let jobId = "";

  beforeAll(() => stubPublicWeb());
  afterAll(async () => {
    vi.unstubAllGlobals();
    await resetDbForTests();
  });

  it("Step A — an inbound email creates a job with the parsed brief and a fixed-scope acknowledgement", async () => {
    await inbound(NOTES, { attachments: [{ filename: "pilot-report.txt", text: PILOT_REPORT }] });
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.threadId, THREAD));
    expect(job).toBeTruthy();
    jobId = job!.id;
    expect(job!.founderEmail).toBe("dana@northwind.dev");
    expect(job!.thesis).toBe("why founders should start with narrow support workflows");
    expect(job!.audience).toBe("early-stage SaaS founders");
    expect(job!.privateTerms).toContain("Acme Robotics");
    expect(job!.stage).toBe("AWAITING_PAYMENT");

    await runWork({ budgetMs: 5_000 });
    const mail = await outbox(jobId);
    expect(mail.map((m) => m.kind)).toEqual(["acknowledgement"]);
    expect(mail[0]!.state).toBe("simulated");
    expect(mail[0]!.text).toContain("Your first article is free");
    expect(mail[0]!.text).toContain("/free?t=");
  });

  it("a duplicate webhook delivery is ignored", async () => {
    const first = await persistEvent("agentmail", "msg_dupe", "message.received", {});
    const second = await persistEvent("agentmail", "msg_dupe", "message.received", {});
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("Step B — fulfillment is idempotent under concurrent calls", async () => {
    const results = await Promise.all([
      fulfillPayment({ jobId, checkoutSessionId: "cs_test_1", amountTotal: 4900 }),
      fulfillPayment({ jobId, checkoutSessionId: "cs_test_1", amountTotal: 4900 }),
      fulfillPayment({ jobId, checkoutSessionId: "cs_test_1", amountTotal: 4900 }),
    ]);
    expect(results.filter((r) => r.fulfilled)).toHaveLength(1);
    const job = await getJob(jobId);
    expect(job!.paymentStatus).toBe("paid");
    expect(job!.stage).toBe("RESEARCHING");
    const db = await getDb();
    const plans = await db.select().from(dispatches).where(eq(dispatches.requestKey, `${jobId}:research_plan`));
    expect(plans).toHaveLength(1);
  });

  it("rejects an underpayment", async () => {
    await expect(fulfillPayment({ jobId, checkoutSessionId: "cs_x", amountTotal: 100 })).rejects.toThrow(/below the order price/);
  });

  it("Steps C–E — research, writing and review catch the unsupported figure and ask the founder", async () => {
    await runWork({ budgetMs: 15_000 });
    const job = await getJob(jobId);
    expect(job!.stage).toBe("WAITING_FOR_FOUNDER");
    expect(job!.openQuestions[0]).toMatch(/^Your notes say first-response time improved by 80% in six weeks, but/);
    expect(job!.openQuestions[0]).toMatch(/60%/);

    const db = await getDb();
    const [review] = await db.select().from(reviews).where(eq(reviews.jobId, jobId));
    expect(review!.outcome).toBe("NEEDS_FOUNDER_INPUT");
    const kinds = review!.findings.map((f) => f.kind);
    expect(kinds).toContain("figure_mismatch");
    expect(kinds).toContain("scope_mismatch");
    const scope = review!.findings.find((f) => f.kind === "scope_mismatch")!;
    expect(scope.passage).toMatch(/42 B2B SaaS companies/);
    expect(scope.proposedFix).toMatch(/42 B2B SaaS companies/);

    const draft = await latestDraft(jobId);
    expect(draft!.bodyMarkdown).not.toMatch(/Acme Robotics/);
    expect((await outbox(jobId)).map((m) => m.kind)).toContain("question");
  });

  it("an unrelated reply is stored but does not resolve the finding", async () => {
    await inbound("Thanks! Quick question — could you also do a version for our newsletter?");
    await runWork({ budgetMs: 10_000 });
    const job = await getJob(jobId);
    expect(job!.stage).toBe("WAITING_FOR_FOUNDER");
    expect(job!.founderReplies).toHaveLength(1);
    expect((await outbox(jobId)).map((m) => m.kind)).toContain("still_waiting");
  });

  it("an answering reply resumes work: the writer uses the supported figure and narrows the claim", async () => {
    await inbound("Use the supported figure from the report — 60% is right.");
    await runWork({ budgetMs: 15_000 });
    const job = await getJob(jobId);
    expect(job!.stage).toBe("READY_FOR_APPROVAL");
    const draft = await latestDraft(jobId);
    expect(draft!.version).toBeGreaterThanOrEqual(2); // the offline writer also gets depth revisions
    expect(draft!.bodyMarkdown).toMatch(/improved by 60%/);
    expect(draft!.bodyMarkdown).not.toMatch(/80%/);
    expect(draft!.bodyMarkdown).not.toMatch(/work for all companies/);
    expect(draft!.bodyMarkdown).toMatch(/42 B2B SaaS companies studied/);
    expect(draft!.corrections.length).toBeGreaterThanOrEqual(2);
    // Copy quality: no repeated headline, the thesis reads as a claim, no duplicated passages.
    expect(draft!.dek.toLowerCase().startsWith(draft!.title.toLowerCase())).toBe(false);
    expect(draft!.bodyMarkdown).toMatch(/Founders should start with narrow support workflows\. That is the argument/);
    expect(draft!.bodyMarkdown.split("Across the 42 B2B SaaS companies in the pilot, median").length - 1).toBe(1);
    expect(job!.revisionCycles).toBeLessThanOrEqual(2); // the founder-answer pass is free; depth revisions stay within the cap
    expect((await outbox(jobId)).map((m) => m.kind)).toContain("review_link");
  });

  it("Step F — approval is bound to the exact content", async () => {
    const draft = (await latestDraft(jobId))!;
    await expect(approveDraft({ jobId, draftId: draft.id, contentHash: "0".repeat(64), destinations: [] })).rejects.toBeInstanceOf(GateError);
    const { destinations } = await approveDraft({ jobId, draftId: draft.id, contentHash: draft.contentHash, destinations: ["x"] });
    expect(destinations).toEqual(["web"]); // X is not connected, so it is dropped
    expect((await getJob(jobId))!.stage).toBe("PUBLISHING");
    await expect(approveDraft({ jobId, draftId: draft.id, contentHash: draft.contentHash, destinations: [] })).rejects.toBeInstanceOf(GateError);
  });

  it("Steps G–H — publishes, verifies the served page, emails the URL, and runs the phone check", async () => {
    await runWork({ budgetMs: 10_000 });
    const job = await getJob(jobId);
    expect(job!.stage).toBe("COMPLETE");
    const db = await getDb();
    const [pub] = await db.select().from(publications).where(eq(publications.jobId, jobId));
    expect(pub!.status).toBe("published");
    expect(pub!.verification?.ok).toBe(true);
    expect(pub!.contentHash).toBe((await latestDraft(jobId))!.contentHash);
    expect(pub!.mobileCheck?.mode).toBe("http-fallback");
    expect(pub!.mobileCheck?.headlineVisible).toBe(true);
    expect((await outbox(jobId)).map((m) => m.kind)).toContain("published");
  });

  it("a second publish of the same job is refused by the gate", async () => {
    const draft = (await latestDraft(jobId))!;
    await expect(submitFounderEdit({ jobId, baseDraftId: draft.id, title: "x", dek: "y", bodyMarkdown: "z".repeat(200), announcement: "a" })).rejects.toBeInstanceOf(GateError);
  });

  it("enqueue is idempotent on the request key", async () => {
    const a = await enqueue(jobId, "mobile_check", "dupe-key");
    const b = await enqueue(jobId, "mobile_check", "dupe-key");
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});

describe("autonomy", () => {
  it("resumes an order the founder hasn't answered, exactly once, with the conservative choice", async () => {
    const { createJob, resumeStaleWaits, AUTO_REPLY } = await import("@/lib/workflow/intake");
    const db = await getDb();
    const job = await createJob({ channel: "web", founderEmail: "slow@founder.test", subject: "Stale", body: "I want to write about why waiting is bad for orders. My audience is founders." });
    const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "T", dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: "h" }).returning();
    await db.update(jobs).set({ stage: "WAITING_FOR_FOUNDER", openQuestions: ["Q?"], updatedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(jobs.id, job.id));
    const [a, b] = await Promise.all([resumeStaleWaits(), resumeStaleWaits()]);
    expect(a + b).toBe(1);
    const after = await getJob(job.id);
    expect(after!.stage).toBe("REVIEWING");
    expect(after!.founderReplies.map((r) => r.text)).toEqual([AUTO_REPLY]);
    const reviews = await db.select().from(dispatches).where(eq(dispatches.jobId, job.id));
    expect(reviews.some((r) => r.kind === "review" && (r.input as { draftId?: string }).draftId === d!.id)).toBe(true);
  });
});

describe("publish gate", () => {
  it("lets the founder approve when only the reviewer agent's soft notes remain", async () => {
    stubPublicWeb();
    const { createJob } = await import("@/lib/workflow/intake");
    const { approveDraft } = await import("@/lib/workflow/publish");
    const db = await getDb();
    const job = await createJob({ channel: "web", founderEmail: "notes@founder.test", subject: "Gate", body: "I want to write about why gates should be precise. My audience is founders." });
    const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "T", dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: "hash-1" }).returning();
    await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [{ id: "agent-x-0", severity: "blocking", kind: "style", claim: "Bold sentence" }] });
    await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
    await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: "hash-1", destinations: [] });
    await runWork({ budgetMs: 8_000 });
    const [pub] = await db.select().from(publications).where(eq(publications.jobId, job.id));
    expect(pub?.status).toBe("published");
  });
});

describe("free first article", () => {
  it("is granted once per email; the database refuses a second free order", async () => {
    const { createJob, isFreeEligible } = await import("@/lib/workflow/intake");
    const db = await getDb();
    const email = "once@founder.test";
    const a = await createJob({ channel: "web", founderEmail: email, subject: "A", body: "I want to write about why one free article is enough. My audience is founders." });
    const b = await createJob({ channel: "web", founderEmail: email, subject: "B", body: "I want to write about why two free articles is too many. My audience is founders." });
    expect(await isFreeEligible(email)).toBe(true);
    await db.update(jobs).set({ amountCents: 0 }).where(eq(jobs.id, a.id));
    expect((await fulfillPayment({ jobId: a.id, checkoutSessionId: `free_${a.id}`, amountTotal: null })).fulfilled).toBe(true);
    expect(await isFreeEligible(email)).toBe(false);
    // Even bypassing the eligibility check, the partial unique index refuses it.
    await db.update(jobs).set({ amountCents: 0 }).where(eq(jobs.id, b.id));
    await expect(fulfillPayment({ jobId: b.id, checkoutSessionId: `free_${b.id}`, amountTotal: null })).rejects.toThrow();
  });
});

describe("X format choice", () => {
  it("stores the founder's one-post or thread choice on the X approval", async () => {
    process.env.X_USER_ACCESS_TOKEN = "test-x-token";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { createJob } = await import("@/lib/workflow/intake");
    const db = await getDb();
    const job = await createJob({ channel: "web", founderEmail: "xchoice@founder.test", subject: "X", body: "I want to write about why one post beats a thread sometimes. My audience is founders." });
    const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "T", dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: "hx" }).returning();
    await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
    await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
    const { destinations } = await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: "hx", destinations: ["x"], xFormat: "single" });
    expect(destinations).toEqual(["web", "x"]);
    const rows = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
    expect(rows.find((r) => r.destination === "x")!.option).toBe("single");
    expect(rows.find((r) => r.destination === "web")!.option).toBeNull();
    delete process.env.X_USER_ACCESS_TOKEN;
    resetEnvCache();
  });
});

describe("approved images", () => {
  async function readyWithImages(tag: string) {
    stubPublicWeb();
    const { createJob } = await import("@/lib/workflow/intake");
    const { images } = await import("@/lib/db/schema");
    const db = await getDb();
    const job = await createJob({ channel: "web", founderEmail: `${tag}@founder.test`, subject: tag, body: "I want to write about why approvals must cover images. My audience is founders." });
    const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: `T ${tag}`, dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: `h-${tag}` }).returning();
    await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
    await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
    const imgs = await db
      .insert(images)
      .values(["keep", "reject"].map((p) => ({ jobId: job.id, slot: "hero", prompt: p, status: "ready" as const, mime: "image/webp", data: Buffer.from(p) })))
      .returning();
    return { db, job, draft: d!, keep: imgs[0]!, reject: imgs[1]!, images };
  }

  it("records only the chosen images and binds their bytes into the approval", async () => {
    const { db, job, draft, keep } = await readyWithImages("imgpick");
    const { hashImages } = await import("@/lib/workflow/publish");
    await approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: [], imageIds: [keep.id] });
    const [a] = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
    expect(a!.imageIds).toEqual([keep.id]);
    expect(a!.imagesHash).toBe(await hashImages(job.id, [keep.id]));
    await runWork({ budgetMs: 8_000 });
    const [pub] = await db.select().from(publications).where(eq(publications.jobId, job.id));
    expect(pub?.status).toBe("published");
  });

  it("refuses to publish when an approved image changes after approval", async () => {
    const { db, job, draft, keep, images } = await readyWithImages("imgswap");
    await approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: [], imageIds: [keep.id] });
    await db.update(images).set({ data: Buffer.from("swapped") }).where(eq(images.id, keep.id));
    await runWork({ budgetMs: 8_000 });
    const pubs = await db.select().from(publications).where(eq(publications.jobId, job.id));
    expect(pubs.some((p) => p.status === "published")).toBe(false);
  });

  it("rejects Instagram approval without a chosen image", async () => {
    const { job, draft } = await readyWithImages("imgig");
    process.env.MOBILERUN_API_KEY = "k";
    process.env.MOBILERUN_DEVICE_ID = "d";
    process.env.INSTAGRAM_VIA_MOBILERUN = "true";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    try {
      await expect(approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: ["instagram"], imageIds: [] })).rejects.toBeInstanceOf(GateError);
    } finally {
      delete process.env.MOBILERUN_API_KEY;
      delete process.env.MOBILERUN_DEVICE_ID;
      delete process.env.INSTAGRAM_VIA_MOBILERUN;
      resetEnvCache();
    }
  });
});

describe("free article by reply", () => {
  async function mail(thread: string, from: string, text: string) {
    const payload = { event_type: "message.received", message: { inbox_id: INBOX, thread_id: thread, message_id: `<${randomUUID()}@mail>`, from, to: [INBOX], subject: "Moat", text, extracted_text: text, attachments: [] } };
    const ev = await persistEvent("simulator", randomUUID(), "message.received", payload);
    await processInboundEvent(ev!.id);
  }

  it("a founder's reply on our thread starts the free article and lands in the brief", async () => {
    const thread = `thd_${randomUUID()}`;
    await mail(thread, "Sam Lee <sam@moat.test>", "I want to write about how founders find a moat. My audience is seed-stage founders.");
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.threadId, thread));
    expect(job!.stage).toBe("AWAITING_PAYMENT");
    expect(job!.paymentStatus).toBe("unpaid");

    // A stranger on the same thread cannot start it.
    await mail(thread, "Eve <eve@other.test>", "start");
    expect((await getJob(job!.id))!.paymentStatus).toBe("unpaid");

    await mail(thread, "Sam Lee <sam@moat.test>", "Focus on distribution moats, not tech.");
    const after = await getJob(job!.id);
    expect(after!.paymentStatus).toBe("paid");
    expect(after!.amountCents).toBe(0);
    expect(after!.founderReplies.at(-1)!.text).toContain("distribution moats");
  });

  it("does not grant a second free article by reply", async () => {
    const t1 = `thd_${randomUUID()}`;
    const t2 = `thd_${randomUUID()}`;
    await mail(t1, "Ria <ria@moat.test>", "I want to write about pricing pages for founders. My audience is founders.");
    await mail(t1, "Ria <ria@moat.test>", "go");
    await mail(t2, "Ria <ria@moat.test>", "I want to write about hiring a first engineer. My audience is founders.");
    await mail(t2, "Ria <ria@moat.test>", "go");
    const db = await getDb();
    const [second] = await db.select().from(jobs).where(eq(jobs.threadId, t2));
    expect(second!.paymentStatus).toBe("unpaid");
  });
});

describe("scheduled publishing", () => {
  async function approvedLater(tag: string, inMs: number) {
    stubPublicWeb();
    const { createJob } = await import("@/lib/workflow/intake");
    const db = await getDb();
    const job = await createJob({ channel: "web", founderEmail: `${tag}@founder.test`, subject: tag, body: "I want to write about why founders should schedule posts. My audience is founders." });
    const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: `Sched ${tag}`, dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: `h-${tag}` }).returning();
    await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
    await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
    const at = new Date(Date.now() + inMs);
    await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: d!.contentHash, destinations: [], publishAt: at });
    return { db, job, draft: d!, at };
  }

  it("records the time on the approval and does not publish early", async () => {
    const { db, job, at } = await approvedLater("sched1", 3 * 3_600_000);
    const [a] = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
    expect(a!.scheduledAt!.getTime()).toBe(at.getTime());
    await runWork({ budgetMs: 3_000 });
    expect(await db.select().from(publications).where(eq(publications.jobId, job.id))).toHaveLength(0);
    const { isScheduled } = await import("@/lib/workflow/publish");
    expect(isScheduled((await getJob(job.id))!)).toBe(true);
  });

  it("publishes immediately on 'publish now'", async () => {
    const { db, job } = await approvedLater("sched2", 3 * 3_600_000);
    const { publishNow } = await import("@/lib/workflow/publish");
    expect(await publishNow(job.id)).toBe(true);
    await runWork({ budgetMs: 8_000 });
    const [pub] = await db.select().from(publications).where(eq(publications.jobId, job.id));
    expect(pub?.status).toBe("published");
  });

  it("cancel returns to review with no approval, and re-approval publishes", async () => {
    const { db, job, draft } = await approvedLater("sched3", 3 * 3_600_000);
    const { cancelSchedule } = await import("@/lib/workflow/publish");
    expect(await cancelSchedule(job.id)).toBe(true);
    expect((await getJob(job.id))!.stage).toBe("READY_FOR_APPROVAL");
    expect(await db.select().from(approvals).where(eq(approvals.jobId, job.id))).toHaveLength(0);
    await approveDraft({ jobId: job.id, draftId: draft.id, contentHash: draft.contentHash, destinations: [] });
    await runWork({ budgetMs: 8_000 });
    const [pub] = await db.select().from(publications).where(eq(publications.jobId, job.id));
    expect(pub?.status).toBe("published");
  });

  it("refuses past or far-future times; under two minutes means now", async () => {
    const { normalizePublishAt } = await import("@/lib/workflow/publish");
    const now = Date.now();
    expect(() => normalizePublishAt(new Date(now - 3_600_000), now)).toThrow(GateError);
    expect(() => normalizePublishAt(new Date(now + 61 * 86_400_000), now)).toThrow(GateError);
    expect(normalizePublishAt(new Date(now + 30_000), now)).toBeNull();
    expect(normalizePublishAt(new Date(now + 3_600_000), now)!.getTime()).toBe(now + 3_600_000);
  });
});

describe("per-channel schedule", () => {
  it("suggests platform-specific slots: LinkedIn Tue–Thu morning, never a weekend", async () => {
    const { nextBestTime, suggestPlan } = await import("@/lib/schedule");
    const friday = new Date(2026, 10, 6, 15, 0); // Fri 3 PM local
    const li = nextBestTime("linkedin", friday);
    expect(li.getDay()).toBe(2);
    expect([li.getHours(), li.getMinutes()]).toEqual([8, 30]);
    const ig = nextBestTime("instagram", friday);
    // Friday evening is not a slot; next is Monday late morning.
    expect(ig.getDay()).toBe(1);
    expect([ig.getHours(), ig.getMinutes()]).toEqual([11, 30]);
    const plan = suggestPlan(["x", "linkedin"], friday);
    expect(plan.x!.getTime()).toBeGreaterThan(plan.web!.getTime());
    expect(plan.linkedin!.getTime()).toBeGreaterThan(plan.web!.getTime());
    for (const d of Object.values(plan)) expect([0, 6]).not.toContain(d.getDay());
  });

  it("stores each channel's time and posts each at its own time after the article", async () => {
    process.env.X_USER_ACCESS_TOKEN = "test-x-token";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    try {
      stubPublicWeb();
      const { createJob } = await import("@/lib/workflow/intake");
      const db = await getDb();
      const job = await createJob({ channel: "web", founderEmail: "perchan@founder.test", subject: "pc", body: "I want to write about why timing matters for posts. My audience is founders." });
      const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "Per channel", dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A {{url}}", contentHash: "h-pc", variants: { x: ["Post {{url}}"], xSingle: "Post {{url}}" } }).returning();
      await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
      await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
      const xAt = new Date(Date.now() + 5 * 3_600_000);
      // Web now; X five hours later.
      await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: "h-pc", destinations: ["x"], schedule: { web: null, x: xAt } });
      const rows = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
      expect(rows.find((r) => r.destination === "web")!.scheduledAt).toBeNull();
      expect(rows.find((r) => r.destination === "x")!.scheduledAt!.getTime()).toBe(xAt.getTime());
      await runWork({ budgetMs: 8_000 });
      const pubs = await db.select().from(publications).where(eq(publications.jobId, job.id));
      expect(pubs.find((p) => p.destination === "web")?.status).toBe("published");
      expect(pubs.find((p) => p.destination === "x")).toBeUndefined();
      const [xd] = await db.select().from(dispatches).where(eq(dispatches.requestKey, `${job.id}:publish:x:${d!.id}`));
      expect(xd!.status).toBe("pending");
      expect(xd!.nextRunAt.getTime()).toBe(xAt.getTime());
      const { upcoming } = await import("@/lib/workflow/publish");
      expect((await upcoming(job.id)).map((u) => u.destination)).toEqual(["x"]);
    } finally {
      delete process.env.X_USER_ACCESS_TOKEN;
      resetEnvCache();
    }
  });

  it("never schedules a post before its article", async () => {
    const { createJob } = await import("@/lib/workflow/intake");
    const db = await getDb();
    process.env.X_USER_ACCESS_TOKEN = "test-x-token";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    try {
      const job = await createJob({ channel: "web", founderEmail: "clamp@founder.test", subject: "cl", body: "I want to write about why order matters for posts. My audience is founders." });
      const [d] = await db.insert(drafts).values({ jobId: job.id, version: 1, author: "writer", title: "Clamp", dek: "D", bodyMarkdown: "B".repeat(300), announcement: "A", contentHash: "h-cl" }).returning();
      await db.insert(reviews).values({ jobId: job.id, draftId: d!.id, outcome: "READY_FOR_APPROVAL", summary: "ok", findings: [] });
      await db.update(jobs).set({ stage: "READY_FOR_APPROVAL", paymentStatus: "paid" }).where(eq(jobs.id, job.id));
      const web = new Date(Date.now() + 10 * 3_600_000);
      await approveDraft({ jobId: job.id, draftId: d!.id, contentHash: "h-cl", destinations: ["x"], schedule: { web, x: new Date(Date.now() + 3_600_000) } });
      const rows = await db.select().from(approvals).where(eq(approvals.jobId, job.id));
      expect(rows.find((r) => r.destination === "x")!.scheduledAt!.getTime()).toBe(web.getTime());
    } finally {
      delete process.env.X_USER_ACCESS_TOKEN;
      resetEnvCache();
    }
  });
});

describe("promo codes", () => {
  it("accepts a Stripe promotion that covers the price, but not a short payment without one", async () => {
    const { createJob } = await import("@/lib/workflow/intake");
    const db = await getDb();
    const a = await createJob({ channel: "web", founderEmail: "promo@founder.test", subject: "P", body: "I want to write about why promo codes help launches. My audience is founders." });
    const b = await createJob({ channel: "web", founderEmail: "short@founder.test", subject: "S", body: "I want to write about why short payments must fail. My audience is founders." });
    await db.update(jobs).set({ amountCents: 900 }).where(eq(jobs.id, a.id));
    await db.update(jobs).set({ amountCents: 900 }).where(eq(jobs.id, b.id));
    expect((await fulfillPayment({ jobId: a.id, checkoutSessionId: "cs_promo_1", amountTotal: 0, discountCents: 900 })).fulfilled).toBe(true);
    await expect(fulfillPayment({ jobId: b.id, checkoutSessionId: "cs_short_1", amountTotal: 0 })).rejects.toThrow(/below the order price/);
  });
});
