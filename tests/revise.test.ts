import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db/client";
import { agentRuns, editRequests, memories, reviews } from "@/lib/db/schema";
import { claimFree, createJob } from "@/lib/workflow/intake";
import { requestSelectionEdit } from "@/lib/workflow/revise";
import { runWork } from "@/lib/workflow/run";
import { getJob, latestDraft } from "@/lib/workflow/store";
import { addKnowledge, updateProfile } from "@/lib/studio/store";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const EMAIL = "sam@example.com";
const NOTES = `I want to write about why small teams should talk to customers before changing pricing. My audience is early-stage SaaS founders.

Notes:
- We talked to ten customers before our last pricing change and our clients told us exactly what to keep.
- Talking to customers first made the change slower but far less risky for our team.
- Founders should treat pricing as a product decision, not a spreadsheet exercise.`;

beforeAll(async () => {
  await resetDbForTests();
});
afterAll(async () => {
  await resetDbForTests();
});

async function settle() {
  for (let i = 0; i < 6; i++) await runWork({ budgetMs: 20_000, idleExitMs: 0 });
}

describe("Studio in the pipeline", () => {
  let jobId = "";

  it("uses the knowledge base, applies the style guide, logs every agent and scores the draft", async () => {
    await updateProfile(EMAIL, { styleGuide: { preferredTerms: [{ use: "teams", insteadOf: ["clients"] }], bannedPhrases: [], tone: "", formatting: [] } });
    await addKnowledge(EMAIL, [{ kind: "company", title: "Pricing principles", content: "We change pricing at most twice a year and always talk to ten customers first. Pricing is a product decision for small teams.", pinned: true }]);
    const job = await createJob({ channel: "web", founderEmail: EMAIL, founderName: "Sam", subject: "Pricing and customers", body: NOTES });
    jobId = job.id;
    expect(await claimFree(job.id)).toBe(true);
    await settle();
    const after = await getJob(job.id);
    expect(after!.stage).toBe("READY_FOR_APPROVAL");
    const draft = await latestDraft(job.id);
    expect(draft!.bodyMarkdown).not.toMatch(/\bclients\b/);
    const db = await getDb();
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id));
    expect(new Set(runs.map((r) => r.role))).toEqual(new Set(["researcher", "writer", "editor", "fact_checker", "reviewer"]));
    expect(runs.find((r) => r.role === "researcher")!.detail.join(" ")).toMatch(/knowledge base/);
    const [review] = await db.select().from(reviews).where(eq(reviews.draftId, draft!.id));
    expect(review!.scores!.overall).toBeGreaterThan(0);
  });

  it("highlight-and-ask rewrites one passage, re-reviews it and remembers the rule", async () => {
    const draft = (await latestDraft(jobId))!;
    const sentence = draft.bodyMarkdown.match(/[^.\n]*\bcustomers\b[^.\n]*\./)![0].replace(/^[-\s]+/, "").replace(/\[(S\d+)\]/g, "$1").trim();
    await requestSelectionEdit({ jobId, draftId: draft.id, selection: sentence, instruction: "replace customers with users" });
    expect((await getJob(jobId))!.stage).toBe("WRITING");
    await settle();
    const next = (await latestDraft(jobId))!;
    expect(next.version).toBe(draft.version + 1);
    expect(next.author).toBe("ai_edit");
    expect(next.contentHash).not.toBe(draft.contentHash);
    expect((await getJob(jobId))!.stage).toBe("READY_FOR_APPROVAL");
    const db = await getDb();
    const [req] = await db.select().from(editRequests).where(eq(editRequests.jobId, jobId));
    expect(req!.status).toBe("applied");
    const mems = await db.select().from(memories).where(eq(memories.ownerEmail, EMAIL));
    expect(mems.map((m) => m.text)).toContain("Use “users” instead of “customers”");
  });

  it("refuses edits it can't place and says why", async () => {
    const draft = (await latestDraft(jobId))!;
    await expect(requestSelectionEdit({ jobId, draftId: draft.id, selection: "text that is not in the article at all", instruction: "shorter" })).rejects.toThrow(/Couldn't find/);
  });
});
