import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { drafts, editRequests } from "@/lib/db/schema";
import { isLive } from "@/lib/env";
import { draftContentHash } from "@/lib/security";
import { applySelectionEdit, localSelectionEdit, locateSelection, parseInstruction } from "@/lib/studio/edit";
import { logAgent, remember } from "@/lib/studio/store";
import { PermanentError, registerHandler } from "./engine";
import { naivePoller, naiveStart } from "./handlers";
import { GateError } from "./publish";
import { enqueue, getJob, latestDraft, transition } from "./store";

/**
 * Highlight-and-ask. The founder selects a passage on the review page and
 * says what to change. Only that passage is rewritten; the result is a new
 * version that goes back through fact-check and review before it can be
 * approved, exactly like a hand edit.
 */

const replacementSchema = z.object({ replacement: z.string().max(4000), summary: z.string().min(3).max(200) });

export async function requestSelectionEdit(args: { jobId: string; draftId: string; selection: string; instruction: string }) {
  const instruction = args.instruction.trim().slice(0, 500);
  const selection = args.selection.trim().slice(0, 4000);
  if (instruction.length < 3) throw new GateError("Say what you'd like changed.");
  const job = await getJob(args.jobId);
  if (!job || job.stage !== "READY_FOR_APPROVAL") throw new GateError("This article isn't open for edits right now.");
  const draft = await latestDraft(job.id);
  if (!draft || draft.id !== args.draftId) throw new GateError("A newer version exists. Reload the page first.");
  if (!locateSelection(draft.bodyMarkdown, selection)) throw new GateError("Couldn't find that passage in the article. Select text inside one section and try again.");
  const db = await getDb();
  const [req] = await db.insert(editRequests).values({ jobId: job.id, draftId: draft.id, selection, instruction }).returning();
  if (await transition(job.id, ["READY_FOR_APPROVAL"], "WRITING", `Applying your edit: “${instruction.slice(0, 80)}”`)) {
    await enqueue(job.id, "revise_selection", `${job.id}:revise:${req!.id}`, { editRequestId: req!.id, instruction });
  }
  return req!;
}

async function load(id: string) {
  const db = await getDb();
  const [req] = await db.select().from(editRequests).where(eq(editRequests.id, id)).limit(1);
  if (!req) throw new PermanentError("Edit request not found");
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, req.draftId)).limit(1);
  return { req, draft: draft! };
}

async function settle(id: string, patch: Partial<typeof editRequests.$inferInsert>) {
  const db = await getDb();
  await db.update(editRequests).set({ ...patch, updatedAt: new Date() }).where(eq(editRequests.id, id));
}

registerHandler("revise_selection", {
  async start(d) {
    const { req, draft } = await load(String(d.input.editRequestId));
    if (isLive("naive")) {
      const range = locateSelection(draft.bodyMarkdown, req.selection);
      const context = range ? draft.bodyMarkdown.slice(Math.max(0, range.start - 600), Math.min(draft.bodyMarkdown.length, range.end + 600)) : "";
      return naiveStart(
        d,
        "writer",
        [
          "Rewrite ONLY the passage below according to the founder's instruction. Keep every [S1]-style citation that still applies, keep facts and figures exactly as they are unless told otherwise, and match the surrounding voice. Return the replacement passage in Markdown and a one-line summary of what you changed.",
          `Instruction: ${req.instruction}`,
          `Passage:\n${range ? draft.bodyMarkdown.slice(range.start, range.end) : req.selection}`,
          `Surrounding text (for context only, do not return it):\n${context}`,
        ].join("\n\n"),
        replacementSchema,
      );
    }
    const range = locateSelection(draft.bodyMarkdown, req.selection);
    const res = localSelectionEdit(range ? draft.bodyMarkdown.slice(range.start, range.end) : req.selection, req.instruction);
    return { done: res.ok ? { replacement: res.replacement, summary: res.summary } : { failed: res.reason }, simulated: true };
  },
  poll: naivePoller(replacementSchema),
  async complete(d, output) {
    const { req, draft } = await load(String(d.input.editRequestId));
    const job = await getJob(d.jobId);
    if (!job) return;
    const out = output as { replacement?: string; summary?: string; failed?: string };
    if (out.failed) {
      await settle(req.id, { status: "failed", note: out.failed });
      await logAgent(job.id, "editor", `${d.requestKey}:agent`, "Couldn't apply your edit", [req.instruction, out.failed], !isLive("naive"));
      await transition(job.id, ["WRITING"], "READY_FOR_APPROVAL", `Couldn't apply “${req.instruction.slice(0, 60)}”: ${out.failed}`);
      return;
    }
    const current = await latestDraft(job.id);
    if (!current || current.id !== draft.id) {
      await settle(req.id, { status: "superseded", note: "A newer version was created first." });
      await transition(job.id, ["WRITING"], "READY_FOR_APPROVAL", null);
      return;
    }
    const range = locateSelection(draft.bodyMarkdown, req.selection);
    if (!range) throw new PermanentError("The passage is no longer in the draft");
    const body = applySelectionEdit(draft.bodyMarkdown, range, out.replacement ?? "");
    const content = { title: draft.title, dek: draft.dek, bodyMarkdown: body, announcement: draft.announcement, variants: draft.variants };
    const db = await getDb();
    const [saved] = await db
      .insert(drafts)
      .values({ jobId: job.id, version: draft.version + 1, author: "ai_edit", title: draft.title, dek: draft.dek, bodyMarkdown: body, announcement: draft.announcement, claims: draft.claims, corrections: [], variants: draft.variants, contentHash: draftContentHash(content) })
      .onConflictDoNothing()
      .returning();
    const next = saved ?? (await db.select().from(drafts).where(and(eq(drafts.jobId, job.id), eq(drafts.version, draft.version + 1))).limit(1))[0]!;
    await settle(req.id, { status: "applied", resultDraftId: next.id, note: out.summary ?? null });
    await logAgent(job.id, "editor", `${d.requestKey}:agent`, `Applied your edit (version ${next.version})`, [`“${req.instruction}”`, out.summary ?? ""].filter(Boolean), !isLive("naive"));
    // Corrections that read as rules carry over to every later article.
    const rule = parseInstruction(req.instruction);
    if (rule.kind === "replace") await remember(job.founderEmail, { kind: "preference", text: `Use “${rule.to}” instead of “${rule.from}”`, origin: "edit_request", jobId: job.id });
    if (rule.kind === "avoid") await remember(job.founderEmail, { kind: "preference", text: `Never say “${rule.phrase}”`, origin: "edit_request", jobId: job.id });
    if (await transition(job.id, ["WRITING"], "REVIEWING", "Fact-checking your edit")) {
      await enqueue(job.id, "review", `${job.id}:review:v${next.version}:r${job.founderReplies.length}`, { draftId: next.id });
    }
  },
  async fail(d, reason) {
    await settle(String(d.input.editRequestId), { status: "failed", note: reason.slice(0, 300) });
    await transition(d.jobId, ["WRITING"], "READY_FOR_APPROVAL", `Couldn't apply your edit: ${reason.slice(0, 120)}`);
  },
});
