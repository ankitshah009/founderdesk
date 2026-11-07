import { z } from "zod";
import { sentences } from "@/lib/extract";
import type { Claim, Finding, FounderReply, Job, ReviewOutcome, Source } from "@/lib/db/schema";

/* ────────────────────────────────────────────────────────────────────────────
 * Stage contracts. Every agent result is validated against these before the
 * job moves forward; the JSON Schema sent to Naïve is derived from the same
 * zod definition so the two can never drift.
 * ──────────────────────────────────────────────────────────────────────────── */

export const researchPlanSchema = z.object({
  refinedThesis: z.string().min(10),
  researchQuestions: z.array(z.string().min(5)).max(6),
  searchQueries: z.array(z.string().min(3)).max(8),
});
export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export const synthesisSchema = z.object({
  evidence: z.array(z.object({ sourceRef: z.string(), passage: z.string().min(10), supports: z.string().min(3) })).max(30),
  limitations: z.array(z.object({ sourceRef: z.string().nullable(), passage: z.string().min(5) })).max(12),
  contradictions: z.array(z.object({ sourceRef: z.string(), passage: z.string().min(10), contradicts: z.string() })).max(12),
  founderQuestions: z.array(z.string()).max(5),
});
export type Synthesis = z.infer<typeof synthesisSchema>;

export const draftOutputSchema = z.object({
  title: z.string().min(5).max(140),
  dek: z.string().min(10).max(320),
  bodyMarkdown: z.string().min(200),
  announcement: z.string().min(10).max(600),
  claims: z.array(z.object({ text: z.string(), sourceRefs: z.array(z.string()) })).max(40),
  corrections: z.array(z.string()).max(20),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

export const reviewOutputSchema = z.object({
  outcome: z.enum(["READY_FOR_APPROVAL", "NEEDS_REVISION", "NEEDS_FOUNDER_INPUT", "UNABLE_TO_COMPLETE"]),
  summary: z.string().min(5),
  findings: z
    .array(
      z.object({
        severity: z.enum(["blocking", "minor"]),
        kind: z.string(),
        claim: z.string(),
        passage: z.string().nullable(),
        sourceRef: z.string().nullable(),
        proposedFix: z.string().nullable(),
        question: z.string().nullable(),
      }),
    )
    .max(20),
  founderQuestions: z.array(z.string()).max(5),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Prompts for the three Naïve agents.
 * ──────────────────────────────────────────────────────────────────────────── */

export const AGENT_SYSTEM = {
  researcher:
    "You are the researcher on a small editorial desk that publishes articles for startup founders. You never invent sources, numbers or quotations. You only cite passages that appear verbatim in the source excerpts you are given, and you always say which population or sample a finding applies to. Respect the founder's publication boundaries.",
  writer:
    "You are the writer on an editorial desk. You write in the founder's first-person voice, plainly and specifically, for the stated audience. Every factual claim must cite a source reference like [S2] that supports it. Founder-provided observations may be stated as the founder's own experience. Never include anything the founder asked to keep private. Output Markdown with ## section headings and finish with a '## Sources' section listing each cited reference.",
  reviewer:
    "You are the reviewer on an editorial desk. Check the draft against the evidence and the publication requirements. Flag claims whose numbers or scope go beyond what the cited passage supports, quote the passage, and propose a precise replacement sentence. Flag any boundary violation. Decide one outcome: READY_FOR_APPROVAL, NEEDS_REVISION (the writer can fix it from the evidence), NEEDS_FOUNDER_INPUT (only the founder can resolve it — ask one specific question), or UNABLE_TO_COMPLETE.",
} as const;

type SourceView = Pick<Source, "ref" | "kind" | "url" | "title" | "content" | "snippet" | "status">;

function briefBlock(job: Job): string {
  return [
    `Topic: ${job.topic}`,
    `Thesis: ${job.thesis ?? "(not stated — infer from the notes)"}`,
    `Audience: ${job.audience ?? "early-stage founders"}`,
    `Publication boundaries: ${job.boundaries.length ? job.boundaries.join(" | ") : "none stated"}`,
    job.privateTerms.length ? `Names that must not appear: ${job.privateTerms.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function sourcesBlock(sources: SourceView[], perSource = 4000): string {
  return sources
    .filter((s) => s.status === "fetched" && (s.content || s.snippet))
    .map((s) => `[${s.ref}] ${s.kind}${s.url ? ` · ${s.url}` : ""}${s.title ? ` · ${s.title}` : ""}\n${(s.content ?? s.snippet ?? "").slice(0, perSource)}`)
    .join("\n\n---\n\n");
}

function repliesBlock(replies: FounderReply[]): string {
  return replies.length ? replies.map((r, i) => `Reply ${i + 1} (${r.receivedAt}): ${r.text}`).join("\n") : "none";
}

export function researchPlanPrompt(job: Job, maxSearches: number): string {
  return [
    "Plan the research for this article.",
    briefBlock(job),
    `Founder notes:\n${job.seedText.slice(0, 6000)}`,
    `Founder-provided links: ${job.sourceUrls.join(", ") || "none"}`,
    `Return a refined one-sentence thesis, up to 6 research questions that need external evidence, and at most ${maxSearches} web search queries.`,
  ].join("\n\n");
}

export function synthesisPrompt(job: Job, plan: ResearchPlan | null, sources: SourceView[]): string {
  return [
    "Extract evidence for this article from the sources below. Passages must be copied verbatim from a source excerpt.",
    briefBlock(job),
    plan ? `Research questions:\n- ${plan.researchQuestions.join("\n- ")}` : "",
    `Sources:\n\n${sourcesBlock(sources)}`,
    "Return supporting passages, important limitations (including which population each finding covers), contradictory evidence, and questions only the founder can answer.",
  ].join("\n\n");
}

export function writePrompt(args: {
  job: Job;
  sources: SourceView[];
  evidence: Array<{ sourceRef: string; passage: string; supports: string; kind: string }>;
  findings: Finding[];
  previousBody: string | null;
}): string {
  const { job } = args;
  return [
    args.previousBody ? "Revise the draft below to resolve every open finding. Keep everything else." : "Write the article.",
    briefBlock(job),
    `Founder notes (the founder's own voice and observations):\n${job.seedText.slice(0, 6000)}`,
    `Founder replies to our questions:\n${repliesBlock(job.founderReplies)}`,
    `Evidence:\n${args.evidence.map((e) => `- [${e.sourceRef}] (${e.kind}) "${e.passage}" — ${e.supports}`).join("\n") || "none"}`,
    args.findings.length ? `Open findings to resolve:\n${args.findings.map((f) => `- ${f.kind}: ${f.claim}${f.proposedFix ? ` → ${f.proposedFix}` : ""}`).join("\n")}` : "",
    args.previousBody ? `Previous draft:\n${args.previousBody}` : "",
    `Available source references: ${args.sources.filter((s) => s.status === "fetched").map((s) => s.ref).join(", ")}`,
    "Also write a short announcement (under 260 characters, ending with {{url}}) and list every factual claim with its source references. List significant corrections you made relative to the founder's notes.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function reviewPrompt(args: {
  job: Job;
  draft: { title: string; dek: string; bodyMarkdown: string; announcement: string; claims: Claim[] };
  sources: SourceView[];
  priorFindings: Finding[];
}): string {
  return [
    "Review this draft for publication.",
    briefBlock(args.job),
    `Founder replies so far:\n${repliesBlock(args.job.founderReplies)}`,
    args.priorFindings.length ? `Findings from the previous review:\n${args.priorFindings.map((f) => `- ${f.kind}: ${f.claim}`).join("\n")}` : "",
    `Sources:\n\n${sourcesBlock(args.sources, 3000)}`,
    `Draft title: ${args.draft.title}\nDek: ${args.draft.dek}\n\n${args.draft.bodyMarkdown}\n\nAnnouncement: ${args.draft.announcement}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Text helpers shared by the guardrails and the local engine.
 * ──────────────────────────────────────────────────────────────────────────── */

const STOP = new Set(
  "about above after again against also although among because been before being below between both but cannot could does doing down during each even every from further have having here into itself just more most much must only other over same should since some such than that their them then there these they this those through under until very were what when where which while with within without would your yours ours ourselves the and for are was not you our can will how why who".split(" "),
);

export function keywords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])
      .filter((w) => !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

const FIGURE_RE = /(\d+(?:\.\d+)?)\s?(%|percent\b|x\b|×)/gi;

export function figures(text: string): string[] {
  return [...text.matchAll(FIGURE_RE)].map((m) => `${m[1]}${m[2]!.toLowerCase().startsWith("p") ? "%" : m[2] === "×" ? "x" : m[2]!.toLowerCase()}`);
}

const UNIVERSAL_RE = /\b(all|every|any)\s+(companies|company|startups?|founders?|teams?|businesses|organi[sz]ations|saas companies)\b|\b(always|universally|everyone)\b/i;
const POPULATION_RE = /\b(?:of|among|across|for|from|in)\s+(?:the\s+|a\s+)?(?:survey(?:ed)?\s+(?:of\s+)?)?(\d[\d,]*\s+(?:[A-Za-z0-9-]+\s+){0,4}?(?:companies|startups|teams|firms|respondents|customers|founders|businesses|organizations))\b/i;

/**
 * The clause that carries a figure, for quoting back to the founder:
 * "We piloted with X and saw response time improved by 80% in six weeks."
 * → "response time improved by 80% in six weeks".
 */
export function metricClause(sentence: string, fig: string): string {
  const parts = sentence.replace(/[.!?]+$/, "").split(/,\s*|;\s*|\s+(?:(?:and|but|so|while|saw|seeing|with)\s+)+/i);
  const hit = parts.find((p) => figures(p).includes(fig)) ?? sentence;
  return hit.replace(/^(?:we|our|i|they|that)\s+/i, "").trim();
}

function withoutCitations(s: string): string {
  return s.replace(/\s*\[S\d+\](?:\s*\[S\d+\])*/g, "").trim();
}

function bodySentences(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l) && !/^\s*-\s*\[S\d+\]/.test(l))
    .join(" ")
    .split(/(?<=[.!?])\s+(?=[A-Z“"(*-])/)
    .map((s) => s.replace(/^[*>\-•\s]+/, "").trim())
    .filter((s) => s.length > 12);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Founder reply interpretation (used for the clarification loop).
 * Receiving a reply is not the same as resolving a finding.
 * ──────────────────────────────────────────────────────────────────────────── */

export type FigureResolution =
  | { kind: "use_supported"; founderFigure: string; supportedFigure: string }
  | { kind: "founder_vouches"; founderFigure: string }
  | { kind: "unresolved" };

export function resolveFigureFinding(finding: Finding, replies: FounderReply[]): FigureResolution {
  const founderFigure = finding.claim.match(FIGURE_RE)?.[0] ? figures(finding.claim)[0]! : "";
  const supportedFigure = finding.passage ? (figures(finding.passage)[0] ?? "") : "";
  for (const r of [...replies].reverse()) {
    const t = r.text.toLowerCase();
    const mentionsSupported = supportedFigure && (t.includes(supportedFigure.toLowerCase()) || t.includes(supportedFigure.replace("%", " percent")));
    if (/\b(use|go with|stick with|fine with|ok with|okay with)\b[^.]*\b(supported|report'?s?|their|that|the lower|60|figure|number)\b/.test(t) || (mentionsSupported && /\b(use|go with|correct|right|yes)\b/.test(t))) {
      return { kind: "use_supported", founderFigure, supportedFigure };
    }
    const mentionsFounder = founderFigure && t.includes(founderFigure.toLowerCase());
    if (mentionsFounder && /\b(internal|our (own )?(data|dashboard|numbers|metrics)|we measured|measured|attached|new report|confirmed)\b/.test(t)) {
      return { kind: "founder_vouches", founderFigure };
    }
    if (r.attachmentSourceIds.length > 0 && /\b(report|attached|data)\b/.test(t)) {
      return { kind: "founder_vouches", founderFigure };
    }
  }
  return { kind: "unresolved" };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Deterministic guardrails. They run on every review, live or simulated, and
 * can only make the outcome stricter than the reviewer agent's verdict.
 * ──────────────────────────────────────────────────────────────────────────── */

export type GuardrailContext = {
  job: Job;
  draft: { title: string; dek: string; bodyMarkdown: string; announcement: string; claims: Claim[] };
  sources: SourceView[];
  revisionCycles: number;
  maxRevisionCycles: number;
};

let findingSeq = 0;
const fid = (kind: string) => `${kind}-${Date.now().toString(36)}-${(findingSeq++).toString(36)}`;

export function runGuardrails(ctx: GuardrailContext): Finding[] {
  const { job, draft, sources } = ctx;
  const findings: Finding[] = [];
  const everything = `${draft.title}\n${draft.dek}\n${draft.bodyMarkdown}\n${draft.announcement}`;

  // 1. Publication boundaries: private names must never ship.
  for (const term of job.privateTerms) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(everything)) {
      findings.push({
        id: fid("boundary"),
        severity: "blocking",
        kind: "boundary_violation",
        claim: `The draft names "${term}", which the founder asked to keep private.`,
        proposedFix: `Refer to "${term}" as "a pilot customer".`,
      });
    }
  }

  const external = sources.filter((s) => s.kind !== "founder_note" && s.status === "fetched" && s.content);
  const externalSentences = external.flatMap((s) => sentences(s.content!).map((text) => ({ ref: s.ref, title: s.title, text, kw: keywords(text) })));
  const vouched = new Set<string>();
  for (const r of job.founderReplies) for (const f of figures(r.text)) if (/\b(internal|our|measured|confirmed|attached)\b/i.test(r.text)) vouched.add(f);

  // 2. Figures: a number in the article must appear in the evidence, unless
  //    the founder has vouched for it as their own measurement.
  const seenFigureClaims = new Set<string>();
  for (const sentence of bodySentences(draft.bodyMarkdown)) {
    const figs = figures(sentence);
    if (!figs.length) continue;
    const kw = keywords(withoutCitations(sentence));
    for (const fig of figs) {
      if (vouched.has(fig)) continue;
      const supported = externalSentences.some((s) => figures(s.text).includes(fig) && overlap(kw, s.kw) >= 1);
      if (supported) continue;
      const rival = externalSentences
        .filter((s) => figures(s.text).some((f) => f !== fig && f.slice(-1) === fig.slice(-1)))
        .map((s) => ({ s, score: overlap(kw, s.kw) }))
        .filter((x) => x.score >= 2)
        .sort((a, b) => b.score - a.score)[0];
      const key = `${fig}|${rival?.s.ref ?? ""}`;
      if (!rival || seenFigureClaims.has(key)) continue;
      seenFigureClaims.add(key);
      const supportedFig = figures(rival.s.text).find((f) => f.slice(-1) === fig.slice(-1))!;
      const metric = metricClause(withoutCitations(sentence), fig);
      const where = rival.s.title ? `“${rival.s.title}”` : `source ${rival.s.ref}`;
      findings.push({
        id: fid("figure"),
        severity: "blocking",
        kind: "figure_mismatch",
        claim: withoutCitations(sentence),
        passage: rival.s.text,
        sourceId: rival.s.ref,
        proposedFix: withoutCitations(sentence).replace(fig.replace("x", ""), supportedFig.replace("x", "")),
        question: `Your notes say ${metric}, but ${where} supports ${supportedFig}. Do you have another report, or should I use the supported figure?`,
      });
    }
  }

  // 3. Scope: universal claims resting on evidence about a narrow group.
  for (const sentence of bodySentences(draft.bodyMarkdown)) {
    if (!UNIVERSAL_RE.test(sentence)) continue;
    const kw = keywords(withoutCitations(sentence));
    const narrow = externalSentences
      .map((s) => ({ s, pop: s.text.match(POPULATION_RE)?.[1], score: overlap(kw, s.kw) }))
      .filter((x) => x.pop && x.score >= 2)
      .sort((a, b) => b.score - a.score)[0];
    if (!narrow) continue;
    const fixed = withoutCitations(sentence).replace(UNIVERSAL_RE, (m) => (/always|universally|everyone/i.test(m) ? `in the study of ${narrow.pop}` : `the ${narrow.pop} studied`));
    findings.push({
      id: fid("scope"),
      severity: "blocking",
      kind: "scope_mismatch",
      claim: withoutCitations(sentence),
      passage: narrow.s.text,
      sourceId: narrow.s.ref,
      proposedFix: `${fixed} [${narrow.s.ref}]`,
    });
  }

  // 4. Citation integrity.
  const known = new Set(sources.filter((s) => s.status === "fetched").map((s) => s.ref));
  const cited = new Set([...draft.bodyMarkdown.matchAll(/\[(S\d+|N\d+)\]/g)].map((m) => m[1]!));
  for (const ref of cited) {
    if (!known.has(ref)) {
      findings.push({ id: fid("citation"), severity: "blocking", kind: "unknown_citation", claim: `The draft cites [${ref}], which is not a retrieved source.`, proposedFix: `Remove [${ref}] or replace it with a retrieved source.` });
    }
  }
  if (!/^##\s+Sources/m.test(draft.bodyMarkdown)) {
    findings.push({ id: fid("sources"), severity: "blocking", kind: "missing_sources", claim: "The draft has no Sources section.", proposedFix: "Add a ## Sources section listing each cited reference." });
  }
  const words = draft.bodyMarkdown.split(/\s+/).length;
  if (words < 180) {
    findings.push({ id: fid("length"), severity: "minor", kind: "too_short", claim: `The draft is ${words} words.` });
  }
  return findings;
}

/** Combine the agent's verdict with guardrail findings; the stricter wins. */
export function decideOutcome(args: {
  agentOutcome: ReviewOutcome | null;
  findings: Finding[];
  job: Job;
  revisionCycles: number;
  maxRevisionCycles: number;
}): { outcome: ReviewOutcome; founderQuestions: string[]; findings: Finding[] } {
  const findings = args.findings.map((f) => {
    if (f.kind !== "figure_mismatch") return f;
    const res = resolveFigureFinding(f, args.job.founderReplies);
    return res.kind === "unresolved" ? f : { ...f, resolved: true, severity: "minor" as const };
  });
  const blocking = findings.filter((f) => f.severity === "blocking" && !f.resolved);
  const needsFounder = blocking.filter((f) => f.question);
  if (args.agentOutcome === "UNABLE_TO_COMPLETE") return { outcome: "UNABLE_TO_COMPLETE", founderQuestions: [], findings };
  if (needsFounder.length) return { outcome: "NEEDS_FOUNDER_INPUT", founderQuestions: needsFounder.map((f) => f.question!), findings };
  if (args.agentOutcome === "NEEDS_FOUNDER_INPUT") return { outcome: "NEEDS_FOUNDER_INPUT", founderQuestions: [], findings };
  if (blocking.length || args.agentOutcome === "NEEDS_REVISION") {
    return args.revisionCycles >= args.maxRevisionCycles
      ? { outcome: "UNABLE_TO_COMPLETE", founderQuestions: [], findings }
      : { outcome: "NEEDS_REVISION", founderQuestions: [], findings };
  }
  return { outcome: "READY_FOR_APPROVAL", founderQuestions: [], findings };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Local editorial engine — the simulated stand-in for the Naïve agents when
 * NAIVE_API_KEY is absent. Deterministic, grounded only in the founder's
 * notes and fetched sources, and labelled "simulated" wherever it surfaces.
 * ──────────────────────────────────────────────────────────────────────────── */

function sentenceCase(s: string): string {
  const t = s.trim().replace(/[.]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function localResearchPlan(job: Job, maxSearches: number): ResearchPlan {
  const thesis = sentenceCase(job.thesis ?? job.topic);
  const queries = [job.topic, `${thesis} evidence`, `${job.topic} study results`, `${job.topic} limitations`].slice(0, maxSearches);
  return {
    refinedThesis: thesis,
    researchQuestions: [
      `What published evidence supports: ${thesis}?`,
      `Which companies or populations does that evidence cover?`,
      `Where does the argument not hold?`,
    ],
    searchQueries: [...new Set(queries)],
  };
}

export function localSynthesis(job: Job, sources: SourceView[]): Synthesis {
  const topicKw = keywords(`${job.topic} ${job.thesis ?? ""} ${job.seedText.slice(0, 600)}`);
  const evidence: Synthesis["evidence"] = [];
  const limitations: Synthesis["limitations"] = [];
  const contradictions: Synthesis["contradictions"] = [];
  for (const s of sources) {
    if (s.kind === "founder_note" || s.status !== "fetched" || !s.content) continue;
    const ranked = sentences(s.content)
      .map((text) => ({ text, score: overlap(topicKw, keywords(text)) + (figures(text).length ? 2 : 0) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score);
    for (const r of ranked.slice(0, 3)) {
      if (/\b(however|but|did not|didn't|no significant|failed to)\b/i.test(r.text)) {
        contradictions.push({ sourceRef: s.ref, passage: r.text, contradicts: job.thesis ?? job.topic });
      } else {
        evidence.push({ sourceRef: s.ref, passage: r.text, supports: sentenceCase(job.thesis ?? job.topic) });
      }
    }
    const used = new Set([...evidence, ...contradictions].map((e) => e.passage));
    for (const text of sentences(s.content)) {
      if (used.has(text)) continue;
      if (POPULATION_RE.test(text) || /\b(only|limited to|small sample|may not generali[sz]e|caveat)\b/i.test(text)) {
        limitations.push({ sourceRef: s.ref, passage: text });
        if (limitations.length >= 6) break;
      }
    }
  }
  return { evidence: evidence.slice(0, 12), limitations: limitations.slice(0, 6), contradictions: contradictions.slice(0, 4), founderQuestions: [] };
}

function scrubPrivate(text: string, terms: string[]): string {
  let out = text;
  for (const t of terms) out = out.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?\\b`, "g"), "a pilot customer");
  return out.replace(/\ba pilot customer a pilot customer\b/g, "a pilot customer");
}

function founderObservations(job: Job): string[] {
  const lines = job.seedText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(hi|hello|hey|thanks|thank you|best|cheers|regards|sent from)\b/i.test(l) && !/^[-–—]{2,}/.test(l));
  const bulletish = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""));
  const pool = bulletish.length ? bulletish : sentences(lines.join(" "));
  return pool
    .map((l) => l.replace(/https?:\/\/\S+/g, "").trim())
    .filter((l) => l.length > 15 && !/\b(keep|private|confidential|audience is|here are my notes|please)\b/i.test(l))
    .slice(0, 6);
}

export function localWrite(args: {
  job: Job;
  sources: SourceView[];
  evidence: Array<{ sourceRef: string; passage: string; supports: string; kind: string }>;
  findings: Finding[];
}): DraftOutput {
  const { job } = args;
  const thesis = sentenceCase(job.thesis ?? job.topic);
  const title = /^why\b/i.test(thesis) ? thesis : sentenceCase(job.topic);
  const audience = job.audience ?? "early-stage founders";
  const corrections: string[] = [];

  let observations = founderObservations(job);
  // Apply the clarification loop's outcome to the founder's own figures.
  for (const f of args.findings.filter((x) => x.kind === "figure_mismatch")) {
    const res = resolveFigureFinding(f, job.founderReplies);
    if (res.kind === "use_supported" && res.founderFigure && res.supportedFigure) {
      observations = observations.map((o) => (o.includes(res.founderFigure.replace("x", "")) ? o.replace(res.founderFigure.replace("x", ""), res.supportedFigure.replace("x", "")) : o));
      corrections.push(`Used ${res.supportedFigure} instead of ${res.founderFigure}: the cited report supports ${res.supportedFigure} [${f.sourceId}].`);
    } else if (res.kind === "founder_vouches") {
      observations = observations.map((o) => (o.includes(res.founderFigure.replace("x", "")) && !/our internal data/.test(o) ? `${o.replace(/[.]$/, "")}, according to our internal data.` : o));
      corrections.push(`Kept ${res.founderFigure} and attributed it to the founder's internal data, as confirmed by email.`);
    }
  }

  const supporting = args.evidence.filter((e) => e.kind === "supporting").slice(0, 5);
  const supportingText = new Set(args.evidence.filter((e) => e.kind === "supporting").map((e) => e.passage));
  const limits = args.evidence.filter((e) => e.kind === "limitation" && !supportingText.has(e.passage)).slice(0, 3);
  const contra = args.evidence.filter((e) => e.kind === "contradiction").slice(0, 2);

  const evidenceParas = supporting.map((e) => `${sentenceCase(e.passage)}. [${e.sourceRef}]`.replace(/\.\. \[/, ". ["));
  const scopeFixes = args.findings.filter((f) => f.kind === "scope_mismatch" && f.proposedFix);

  const claimSentence = sentenceCase(thesis.replace(/^why\s+/i, ""));
  const opening = `${claimSentence}. That is the argument of this piece, written for ${audience}.`;
  // The founder's own sentences are carried into the draft as written; when the
  // reviewer has narrowed one to the population its source actually studied,
  // use the reviewer's sentence instead.
  for (const f of scopeFixes) {
    const probe = f.claim.slice(0, 48);
    let applied = false;
    observations = observations.map((o) => {
      if (!applied && withoutCitations(o).startsWith(probe)) {
        applied = true;
        return f.proposedFix!;
      }
      return o;
    });
    if (applied) corrections.push(`Narrowed "${f.claim.slice(0, 80)}…" to the population the source actually studied [${f.sourceId}].`);
  }

  const cited = new Set<string>([...`${opening} ${observations.join(" ")} ${evidenceParas.join(" ")}`.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!));
  for (const e of [...limits, ...contra]) cited.add(e.sourceRef);
  const sourceList = args.sources.filter((s) => cited.has(s.ref));

  const body = [
    "## The short version",
    opening,
    "## What we saw",
    observations.length ? observations.map((o) => `- ${o}`).join("\n") : "- (No first-hand observations were included in the notes.)",
    "## What the evidence says",
    evidenceParas.length ? evidenceParas.join("\n\n") : "We could not retrieve external evidence for this argument, so this piece rests on our own experience.",
    ...(limits.length || contra.length
      ? ["## Where this doesn't apply", [...limits.map((l) => `- ${l.passage} [${l.sourceRef}]`), ...contra.map((c) => `- ${c.passage} [${c.sourceRef}]`)].join("\n")]
      : []),
    "## What to do next",
    `If you are one of the ${audience} weighing this, pick one workflow you can measure, run it narrowly, and expand only once the numbers hold.`,
    "## Sources",
    sourceList.length ? sourceList.map((s) => `- [${s.ref}] ${s.title ?? s.url ?? "Source"}${s.url ? ` — ${s.url}` : ""}`).join("\n") : "- Founder's notes",
  ].join("\n\n");

  const claims: DraftOutput["claims"] = [opening, ...observations, ...evidenceParas]
    .flatMap((p) => p.split(/(?<=\])\s+/))
    .map((t) => ({ text: t.replace(/\s*\[S\d+\]/g, "").trim(), sourceRefs: [...t.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!) }))
    .filter((c) => c.sourceRefs.length);

  const dek =
    title.toLowerCase() === thesis.toLowerCase()
      ? `A note for ${audience}: what the evidence supports, where it stops, and what we learned first-hand.`
      : `${thesis}. What the evidence supports, where it stops, and what we learned first-hand.`;
  const draft: DraftOutput = {
    title: scrubPrivate(title, job.privateTerms),
    dek: scrubPrivate(dek, job.privateTerms).slice(0, 300),
    bodyMarkdown: scrubPrivate(body, job.privateTerms),
    announcement: `New essay: ${scrubPrivate(title, job.privateTerms)}. Sourced, reviewed, and published. {{url}}`.slice(0, 280),
    claims,
    corrections,
  };
  return draft;
}

export function localReview(): Pick<ReviewOutput, "outcome" | "summary"> {
  return { outcome: "READY_FOR_APPROVAL", summary: "Simulated reviewer: structural checks only; deterministic guardrails decide the outcome." };
}
