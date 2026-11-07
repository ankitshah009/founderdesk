import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appSettings, dispatches, drafts, evidence, jobs, reviews, sources, type Dispatch, type Finding, type Job } from "@/lib/db/schema";
import { env, isLive } from "@/lib/env";
import { bytesToText, fetchPage } from "@/lib/extract";
import { fetchAttachment } from "@/lib/integrations/agentmail";
import * as monid from "@/lib/integrations/monid";
import * as naive from "@/lib/integrations/naive";
import { draftContentHash, sha256 } from "@/lib/security";
import {
  AGENT_SYSTEM,
  decideOutcome,
  draftOutputSchema,
  jsonSchemaOf,
  localResearchPlan,
  localReview,
  localSynthesis,
  localWrite,
  researchPlanPrompt,
  researchPlanSchema,
  reviewOutputSchema,
  reviewPrompt,
  runGuardrails,
  synthesisPrompt,
  synthesisSchema,
  writePrompt,
  type ResearchPlan,
} from "./editorial";
import { PermanentError, idempotencyKey, registerHandler, type PollResult, type StartResult } from "./engine";
import { queueMessage, templates } from "./outbound";
import { addSources, dispatchCount, enqueue, getJob, jobEvidence, jobSources, latestDraft, latestReview, openDispatchCount, transition } from "./store";

const MIN_USEFUL_TEXT = 200;

async function requireJob(d: Dispatch): Promise<Job> {
  const job = await getJob(d.jobId);
  if (!job) throw new PermanentError(`Job ${d.jobId} not found`);
  return job;
}

/* ── Naïve agents ─────────────────────────────────────────────────────────── */

type Role = keyof typeof AGENT_SYSTEM;

async function agentId(role: Role): Promise<string> {
  const db = await getDb();
  const key = `naive_agent_${role}`;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (row) return (row.value as { id: string }).id;
  const created = await naive.createAgent({
    name: `FounderDesk ${role}`,
    system: AGENT_SYSTEM[role],
    idempotencyKey: `founderdesk-agent-${role}-v1`,
  });
  await db.insert(appSettings).values({ key, value: { id: created.id } }).onConflictDoNothing();
  return created.id;
}

async function naiveStart(d: Dispatch, role: Role, message: string, schema: z.ZodType): Promise<StartResult> {
  const session = await naive.createSession({
    agentId: await agentId(role),
    message,
    outputSchema: jsonSchemaOf(schema),
    idempotencyKey: idempotencyKey(d),
    metadata: { job_id: d.jobId, stage: d.kind },
  });
  return { started: session.id, provider: "naive" };
}

function naivePoller(schema: z.ZodType) {
  return async (d: Dispatch): Promise<PollResult> => {
    const verdict = naive.judgeSession(await naive.getSession(d.providerRef!));
    if (verdict.state === "running") return { running: true };
    if (verdict.state === "failed") return { failed: `Naïve session ${d.providerRef}: ${verdict.reason}`, retryable: true };
    const parsed = schema.safeParse(verdict.output);
    if (!parsed.success) return { failed: `Structured result did not validate: ${parsed.error.issues[0]?.message}`, retryable: true };
    return { done: parsed.data };
  };
}

async function failJob(jobId: string, reason: string) {
  await transition(jobId, ["PAID", "RESEARCHING", "WRITING", "REVIEWING"], "UNABLE_TO_COMPLETE", reason);
}

/* ── Monid runs (shared by search and fetch) ─────────────────────────────── */

async function monidStart(provider: string, endpoint: string, input: Record<string, unknown>): Promise<StartResult> {
  const run = await monid.run(provider, endpoint, input);
  if (run.status === "BLOCKED") throw new PermanentError(`Monid blocked the run: ${run.reason ?? "control gate"}`);
  if (run.status === "COMPLETED") return { done: { monid: run } };
  if (monid.TERMINAL.has(run.status)) throw new Error(`Monid run ${run.runId} ended ${run.status}`);
  return { started: run.runId, provider: "monid" };
}

async function monidPoll(d: Dispatch): Promise<PollResult> {
  const run = await monid.getRun(d.providerRef!);
  if (!monid.TERMINAL.has(run.status)) return { running: true };
  if (run.status === "COMPLETED") return { done: { monid: run } };
  return { failed: `Monid run ${run.runId} ended ${run.status}`, retryable: run.status === "FAILED" || run.status === "TIMED_OUT" };
}

function providerFailed(run: monid.MonidRun): boolean {
  return (run.providerResponse?.httpStatus ?? 200) >= 400 || Boolean(run.providerResponse?.error);
}

/** When every search and fetch for a job is settled, synthesise evidence. */
async function joinResearch(jobId: string, selfId: string) {
  const job = await getJob(jobId);
  if (job?.stage !== "RESEARCHING") return;
  if ((await openDispatchCount(jobId, ["research_plan", "source_search", "source_fetch"], selfId)) > 0) return;
  await enqueue(jobId, "research_synthesis", `${jobId}:synthesis`);
}

/* ── research_plan ─────────────────────────────────────────────────────────── */

registerHandler("research_plan", {
  async start(d) {
    const job = await requireJob(d);
    if (isLive("naive")) return naiveStart(d, "researcher", researchPlanPrompt(job, env().RESEARCH_MAX_SEARCHES), researchPlanSchema);
    return { done: localResearchPlan(job, env().RESEARCH_MAX_SEARCHES), simulated: true };
  },
  poll: naivePoller(researchPlanSchema),
  async complete(d, output) {
    const plan = researchPlanSchema.parse(output);
    const job = await requireJob(d);
    const db = await getDb();
    if (!job.thesis) await db.update(jobs).set({ thesis: plan.refinedThesis }).where(eq(jobs.id, job.id));

    // Founder links become sources (idempotent on re-apply).
    const existing = await jobSources(job.id);
    const have = new Set(existing.map((s) => s.url));
    await addSources(
      job.id,
      job.sourceUrls.filter((u) => !have.has(u)).map((url) => ({ kind: "founder_url" as const, url })),
    );
    for (const s of await jobSources(job.id)) {
      if (s.status === "pending") await enqueue(job.id, "source_fetch", `${job.id}:fetch:${s.id}`, { sourceId: s.id });
    }

    const e = env();
    if (isLive("monid") && e.MONID_SEARCH_PROVIDER && e.MONID_SEARCH_ENDPOINT) {
      await Promise.all(plan.searchQueries.slice(0, e.RESEARCH_MAX_SEARCHES).map((query, i) => enqueue(job.id, "source_search", `${job.id}:search:${i}`, { query })));
    }
    await joinResearch(job.id, d.id);
  },
  async fail(d, reason) {
    await failJob(d.jobId, `Research planning failed: ${reason}`);
  },
});

/* ── source_search ─────────────────────────────────────────────────────────── */

registerHandler("source_search", {
  async start(d) {
    const e = env();
    const input = monid.fillTemplate(e.MONID_SEARCH_INPUT, { query: String(d.input.query) });
    return monidStart(e.MONID_SEARCH_PROVIDER!, e.MONID_SEARCH_ENDPOINT!, input);
  },
  poll: monidPoll,
  pollEveryMs: 4_000,
  async complete(d, output) {
    const run = (output as { monid: monid.MonidRun }).monid;
    if (!providerFailed(run)) {
      const docs = monid.normalizeDocs(run.output, 8);
      const existing = await jobSources(d.jobId);
      const have = new Set(existing.map((s) => s.url));
      let budget = env().RESEARCH_MAX_FETCHES - (await dispatchCount(d.jobId, "source_fetch"));
      const fresh = docs.filter((doc) => !have.has(doc.url));
      const ready = fresh.filter((doc) => (doc.content?.length ?? 0) >= 400);
      const needFetch = fresh.filter((doc) => (doc.content?.length ?? 0) < 400).slice(0, Math.max(0, budget));
      budget -= needFetch.length;
      await addSources(
        d.jobId,
        ready.map((doc) => ({
          kind: "search_result" as const,
          url: doc.url,
          title: doc.title,
          snippet: doc.snippet,
          content: doc.content!.slice(0, 40_000),
          contentHash: sha256(doc.content!),
          publishedDate: doc.publishedDate,
          provider: `monid:${run.provider}${run.endpoint}`,
          status: "fetched" as const,
          meta: { query: d.input.query, monidRunId: run.runId },
        })),
      );
      const created = await addSources(
        d.jobId,
        needFetch.map((doc) => ({
          kind: "search_result" as const,
          url: doc.url,
          title: doc.title,
          snippet: doc.snippet,
          publishedDate: doc.publishedDate,
          meta: { query: d.input.query, monidRunId: run.runId },
        })),
      );
      for (const s of created) await enqueue(d.jobId, "source_fetch", `${d.jobId}:fetch:${s.id}`, { sourceId: s.id });
    }
    await joinResearch(d.jobId, d.id);
  },
  async fail(d) {
    await joinResearch(d.jobId, d.id);
  },
});

/* ── source_fetch ──────────────────────────────────────────────────────────── */

async function loadSource(d: Dispatch) {
  const db = await getDb();
  const [s] = await db.select().from(sources).where(eq(sources.id, String(d.input.sourceId))).limit(1);
  if (!s) throw new PermanentError("Source not found");
  return s;
}

registerHandler("source_fetch", {
  async start(d) {
    const s = await loadSource(d);
    if (s.kind === "attachment") {
      const meta = s.meta as { inboxId?: string; messageId?: string; attachmentId?: string; filename?: string; contentType?: string; inlineText?: string };
      if (meta.inlineText != null) return { done: { text: meta.inlineText, title: meta.filename ?? s.title, via: "inline" }, simulated: !isLive("agentmail") };
      const file = await fetchAttachment({ inboxId: meta.inboxId!, messageId: meta.messageId!, attachmentId: meta.attachmentId! });
      const text = await bytesToText(file.bytes, file.contentType || meta.contentType || "", meta.filename);
      return { done: { text, title: meta.filename ?? s.title, via: "agentmail" } };
    }
    const e = env();
    if (isLive("monid") && e.MONID_FETCH_PROVIDER && e.MONID_FETCH_ENDPOINT) {
      return monidStart(e.MONID_FETCH_PROVIDER, e.MONID_FETCH_ENDPOINT, monid.fillTemplate(e.MONID_FETCH_INPUT, { url: s.url! }));
    }
    const page = await fetchPage(s.url!);
    if (page.status >= 500 || page.status === 429) throw new Error(`HTTP ${page.status} fetching ${s.url}`);
    return { done: { text: page.text, title: page.title, httpStatus: page.status, via: "http" } };
  },
  poll: monidPoll,
  pollEveryMs: 4_000,
  async complete(d, output) {
    const s = await loadSource(d);
    const out = output as { text?: string | null; title?: string | null; httpStatus?: number; via?: string; monid?: monid.MonidRun };
    let text = out.text ?? null;
    let title = out.title ?? s.title;
    let provider = out.via === "http" ? "http" : out.via === "agentmail" || out.via === "inline" ? "agentmail" : null;
    let error: string | null = null;
    if (out.monid) {
      provider = `monid:${out.monid.provider}${out.monid.endpoint}`;
      if (providerFailed(out.monid)) error = `Provider returned HTTP ${out.monid.providerResponse?.httpStatus ?? "error"}`;
      else {
        text = monid.extractText(out.monid.output);
        title = title ?? monid.normalizeDocs(out.monid.output, 1)[0]?.title ?? null;
      }
    }
    if (out.httpStatus && out.httpStatus >= 400) error = `HTTP ${out.httpStatus}`;
    // A completed run is not evidence: require usable text.
    const useful = !error && text && text.trim().length >= MIN_USEFUL_TEXT;
    const db = await getDb();
    await db
      .update(sources)
      .set(
        useful
          ? { status: "fetched", content: text!.slice(0, 40_000), contentHash: sha256(text!), title, provider, error: null }
          : { status: "empty", provider, title, error: error ?? "Retrieved content had no usable text" },
      )
      .where(eq(sources.id, s.id));
    await joinResearch(d.jobId, d.id);
  },
  async fail(d, reason) {
    const db = await getDb();
    await db.update(sources).set({ status: "failed", error: reason.slice(0, 500) }).where(eq(sources.id, String(d.input.sourceId)));
    await joinResearch(d.jobId, d.id);
  },
});

/* ── research_synthesis ───────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();

async function researchPlanOf(jobId: string): Promise<ResearchPlan | null> {
  const db = await getDb();
  const [row] = await db.select().from(dispatches).where(eq(dispatches.requestKey, `${jobId}:research_plan`)).limit(1);
  const parsed = researchPlanSchema.safeParse(row?.output);
  return parsed.success ? parsed.data : null;
}

registerHandler("research_synthesis", {
  async start(d) {
    const job = await requireJob(d);
    const srcs = await jobSources(job.id);
    if (isLive("naive")) return naiveStart(d, "researcher", synthesisPrompt(job, await researchPlanOf(job.id), srcs), synthesisSchema);
    return { done: localSynthesis(job, srcs), simulated: true };
  },
  poll: naivePoller(synthesisSchema),
  async complete(d, output) {
    const syn = synthesisSchema.parse(output);
    const db = await getDb();
    const srcs = await jobSources(d.jobId);
    const byRef = new Map(srcs.map((s) => [s.ref, s]));
    const already = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.jobId, d.jobId)).limit(1);
    if (!already.length) {
      // Only keep passages that really appear in the cited source.
      const verbatim = (ref: string | null, passage: string) => {
        const s = ref ? byRef.get(ref) : undefined;
        return Boolean(s?.content && norm(s.content).includes(norm(passage)));
      };
      const rows = [
        ...syn.evidence.filter((e) => verbatim(e.sourceRef, e.passage)).map((e) => ({ sourceRef: e.sourceRef, passage: e.passage, supports: e.supports, kind: "supporting" as const })),
        ...syn.limitations.filter((l) => !l.sourceRef || verbatim(l.sourceRef, l.passage)).map((l) => ({ sourceRef: l.sourceRef, passage: l.passage, supports: "Limitation", kind: "limitation" as const })),
        ...syn.contradictions.filter((c) => verbatim(c.sourceRef, c.passage)).map((c) => ({ sourceRef: c.sourceRef, passage: c.passage, supports: c.contradicts, kind: "contradiction" as const })),
      ];
      if (rows.length) {
        await db.insert(evidence).values(
          rows.map((r) => ({ jobId: d.jobId, sourceId: r.sourceRef ? (byRef.get(r.sourceRef)?.id ?? null) : null, passage: r.passage, supports: r.supports, kind: r.kind })),
        );
      }
    }
    if (await transition(d.jobId, ["RESEARCHING"], "WRITING")) {
      await enqueue(d.jobId, "write", `${d.jobId}:write:v1`, { version: 1 });
    }
  },
  async fail(d, reason) {
    await failJob(d.jobId, `Research synthesis failed: ${reason}`);
  },
});

/* ── write ─────────────────────────────────────────────────────────────────── */

/** Every finding the writer must honour, across all reviews of this job. */
async function cumulativeFindings(jobId: string): Promise<Finding[]> {
  const db = await getDb();
  const all = await db.select().from(reviews).where(eq(reviews.jobId, jobId)).orderBy(asc(reviews.createdAt));
  const out = new Map<string, Finding>();
  for (const r of all) for (const f of r.findings) if (f.proposedFix || f.kind === "figure_mismatch") out.set(`${f.kind}|${f.claim}`, f);
  return [...out.values()];
}

registerHandler("write", {
  async start(d) {
    const job = await requireJob(d);
    const [srcs, ev, findings, prev] = await Promise.all([jobSources(job.id), jobEvidence(job.id), cumulativeFindings(job.id), latestDraft(job.id)]);
    const evidenceView = ev.map((e) => ({ sourceRef: e.sourceRef ?? "", passage: e.passage, supports: e.supports, kind: e.kind }));
    if (isLive("naive")) {
      return naiveStart(d, "writer", writePrompt({ job, sources: srcs, evidence: evidenceView, findings, previousBody: prev?.bodyMarkdown ?? null }), draftOutputSchema);
    }
    return { done: localWrite({ job, sources: srcs, evidence: evidenceView, findings }), simulated: true };
  },
  poll: naivePoller(draftOutputSchema),
  async complete(d, output) {
    const out = draftOutputSchema.parse(output);
    const version = Number(d.input.version);
    const db = await getDb();
    const [draft] = await db
      .insert(drafts)
      .values({
        jobId: d.jobId,
        version,
        author: "writer",
        title: out.title,
        dek: out.dek,
        bodyMarkdown: out.bodyMarkdown,
        announcement: out.announcement,
        claims: out.claims.map((c) => ({ text: c.text, sourceIds: c.sourceRefs })),
        corrections: out.corrections,
        contentHash: draftContentHash(out),
      })
      .onConflictDoNothing()
      .returning();
    const saved = draft ?? (await db.select().from(drafts).where(and(eq(drafts.jobId, d.jobId), eq(drafts.version, version))).limit(1))[0]!;
    const job = await requireJob(d);
    if (await transition(d.jobId, ["WRITING"], "REVIEWING")) {
      await enqueue(d.jobId, "review", `${d.jobId}:review:v${saved.version}:r${job.founderReplies.length}`, { draftId: saved.id });
    }
  },
  async fail(d, reason) {
    await failJob(d.jobId, `Writing failed: ${reason}`);
  },
});

/* ── review ────────────────────────────────────────────────────────────────── */

registerHandler("review", {
  async start(d) {
    // A founder's emailed attachment may still be downloading; review with it.
    if ((await openDispatchCount(d.jobId, ["source_fetch"])) > 0) return { defer: 3_000, reason: "Waiting for new sources" };
    const job = await requireJob(d);
    const draft = await latestDraft(job.id);
    if (!draft || draft.id !== d.input.draftId) return { done: { superseded: true } };
    if (isLive("naive")) {
      const prior = await latestReview(job.id);
      return naiveStart(d, "reviewer", reviewPrompt({ job, draft, sources: await jobSources(job.id), priorFindings: prior?.findings ?? [] }), reviewOutputSchema);
    }
    return { done: localReview(), simulated: true };
  },
  poll: naivePoller(reviewOutputSchema),
  async complete(d, output) {
    if ((output as { superseded?: boolean }).superseded) return;
    const job = await requireJob(d);
    const draft = await latestDraft(job.id);
    if (!draft || draft.id !== d.input.draftId) return;
    const db = await getDb();

    const agent = reviewOutputSchema.partial().parse(output);
    const agentFindings: Finding[] = (agent.findings ?? []).map((f, i) => ({
      id: `agent-${d.id.slice(0, 8)}-${i}`,
      severity: f.severity,
      kind: f.kind,
      claim: f.claim,
      passage: f.passage ?? undefined,
      sourceId: f.sourceRef ?? undefined,
      proposedFix: f.proposedFix ?? undefined,
      question: f.question ?? undefined,
    }));
    const srcs = await jobSources(job.id);
    const maxCycles = env().MAX_REVISION_CYCLES;
    const guard = runGuardrails({ job, draft, sources: srcs, revisionCycles: job.revisionCycles, maxRevisionCycles: maxCycles });
    let decision = decideOutcome({ agentOutcome: agent.outcome ?? null, findings: [...guard, ...agentFindings], job, revisionCycles: job.revisionCycles, maxRevisionCycles: maxCycles });
    const agentQuestions = (agent.founderQuestions ?? []).filter(Boolean);
    if (decision.outcome === "NEEDS_FOUNDER_INPUT" && !decision.founderQuestions.length) decision = { ...decision, founderQuestions: agentQuestions };

    // Was this draft waiting on the founder? Then an answer must be written in
    // before approval, whatever the checks say — and that pass is free.
    const previous = await db.select().from(reviews).where(eq(reviews.draftId, draft.id)).orderBy(asc(reviews.createdAt));
    const answeredFounder = previous.some((r) => r.outcome === "NEEDS_FOUNDER_INPUT") && decision.outcome !== "NEEDS_FOUNDER_INPUT" && decision.outcome !== "UNABLE_TO_COMPLETE";
    if (answeredFounder) decision = { ...decision, outcome: "NEEDS_REVISION" };

    const summary = agent.summary ?? `${decision.findings.filter((f) => f.severity === "blocking" && !f.resolved).length} blocking finding(s)`;
    const [review] = await db
      .insert(reviews)
      .values({ jobId: job.id, draftId: draft.id, outcome: decision.outcome, summary, findings: decision.findings, founderQuestions: decision.founderQuestions })
      .returning();

    switch (decision.outcome) {
      case "READY_FOR_APPROVAL": {
        const moved = await transition(job.id, ["REVIEWING"], "READY_FOR_APPROVAL", null, { openQuestions: [] });
        if (moved) await queueMessage(moved, "review_link", `${job.id}:review_link:${draft.id}`, templates.review_link(moved));
        break;
      }
      case "NEEDS_REVISION": {
        const cycles = answeredFounder ? job.revisionCycles : job.revisionCycles + 1;
        if (await transition(job.id, ["REVIEWING"], "WRITING", answeredFounder ? "Writing in the founder's answer" : "Revising from reviewer findings", { revisionCycles: cycles, openQuestions: [] })) {
          await enqueue(job.id, "write", `${job.id}:write:v${draft.version + 1}`, { version: draft.version + 1 });
        }
        break;
      }
      case "NEEDS_FOUNDER_INPUT": {
        const askedBefore = previous.find((r) => r.outcome === "NEEDS_FOUNDER_INPUT");
        const moved = await transition(job.id, ["REVIEWING"], "WAITING_FOR_FOUNDER", "Waiting for the founder to answer the reviewer's question", {
          openQuestions: decision.founderQuestions,
        });
        if (moved) {
          const sameQuestion = askedBefore && askedBefore.founderQuestions.join("|") === decision.founderQuestions.join("|");
          await queueMessage(
            moved,
            sameQuestion ? "still_waiting" : "question",
            `${job.id}:${sameQuestion ? "still_waiting" : "question"}:${review!.id}`,
            sameQuestion ? templates.still_waiting(moved, decision.founderQuestions) : templates.question(moved, decision.founderQuestions),
          );
        }
        break;
      }
      case "UNABLE_TO_COMPLETE":
        await transition(job.id, ["REVIEWING"], "UNABLE_TO_COMPLETE", `Reviewer could not clear the draft after ${job.revisionCycles} revision cycle(s): ${summary}`);
        break;
    }
  },
  async fail(d, reason) {
    await failJob(d.jobId, `Review failed: ${reason}`);
  },
});
