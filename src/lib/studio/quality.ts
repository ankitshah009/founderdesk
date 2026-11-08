import type { Finding, QualityScores, Source, VoiceProfile } from "@/lib/db/schema";
import { isSoftFinding } from "@/lib/workflow/humanize";
import { clamp, mean, proseOf, readingEase, sentencesOf, wordsOf } from "./text";
import { voiceMatch } from "./voice";

/**
 * Quality score for a draft. Every component is computed from the draft, its
 * sources and the review's findings, so the founder can see exactly why a
 * score is what it is (the suggestions say what would raise it).
 */

type DraftView = { title: string; dek: string; bodyMarkdown: string };
type SourceView = Pick<Source, "ref" | "kind" | "status" | "content" | "url">;

function trigrams(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i++) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

export function accuracyScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.resolved) continue;
    if (f.severity === "blocking") score -= isSoftFinding(f) ? 4 : 25;
    else score -= 2;
  }
  return clamp(score);
}

export function sourcesScore(draft: DraftView, sources: SourceView[]): { score: number; cited: number; external: number; unknown: number } {
  const fetched = new Map(sources.filter((s) => s.status === "fetched").map((s) => [s.ref, s]));
  const refs = new Set([...draft.bodyMarkdown.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!));
  let external = 0;
  let unknown = 0;
  for (const r of refs) {
    const s = fetched.get(r);
    if (!s) unknown++;
    else if (s.kind !== "founder_note" && s.kind !== "knowledge") external++;
  }
  const body = proseOf(draft.bodyMarkdown);
  const factual = sentencesOf(draft.bodyMarkdown.split(/^##\s+Sources\b/im)[0] ?? "").filter((s) => /\d/.test(s) || /\[S\d+\]/.test(s));
  const citedFactual = factual.filter((s) => /\[S\d+\]/.test(s)).length;
  const coverage = factual.length ? citedFactual / factual.length : body ? 0.5 : 0;
  const score = 25 + Math.min(30, external * 12) + Math.min(15, (refs.size - external - unknown) * 7) + coverage * 30 - unknown * 20 - (/^##\s+Sources/m.test(draft.bodyMarkdown) ? 0 : 15);
  return { score: clamp(score), cited: refs.size, external, unknown };
}

/** Share of sentences that are not lifted wholesale from a source. Quoting evidence is fine; an article of quotes is not. */
export function originalityScore(draft: DraftView, sources: SourceView[]): number {
  const sourceGrams = new Set<string>();
  for (const s of sources) if (s.content && s.kind !== "founder_note" && s.kind !== "knowledge") for (const g of trigrams(wordsOf(s.content))) sourceGrams.add(g);
  const sents = sentencesOf(proseOf(draft.bodyMarkdown));
  if (!sents.length) return 0;
  const copied = sents.filter((s) => {
    const g = [...trigrams(wordsOf(s))];
    return g.length >= 3 && g.filter((x) => sourceGrams.has(x)).length / g.length >= 0.7;
  }).length;
  const firstHand = /\b(we|our|i|my)\b/i.test(proseOf(draft.bodyMarkdown)) ? 10 : 0;
  return clamp(100 - (copied / sents.length) * 70 + firstHand, 25, 100);
}

export function readabilityScore(draft: DraftView): { score: number; ease: number; avgSentence: number } {
  const prose = proseOf(draft.bodyMarkdown);
  const ease = readingEase(prose);
  const avgSentence = mean(sentencesOf(prose).map((s) => s.split(/\s+/).length));
  let score = ease >= 50 && ease <= 80 ? 100 : ease < 50 ? 100 - (50 - ease) * 1.4 : 100 - (ease - 80) * 0.8;
  if (avgSentence > 24) score -= (avgSentence - 24) * 3;
  return { score: clamp(score, 20, 100), ease, avgSentence: Math.round(avgSentence) };
}

/** Search: classic SEO basics plus what AI answer engines quote (question headings, answer-first paragraphs). */
export function searchChecks(draft: DraftView): Array<{ label: string; ok: boolean; weight: number }> {
  const headings = [...draft.bodyMarkdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!.trim()).filter((h) => !/^sources$/i.test(h));
  const firstPara = (draft.bodyMarkdown.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith("#")) ?? "").trim();
  const titleWords = [...wordsOf(draft.title)].filter((w) => w.length > 4);
  const opening = wordsOf(proseOf(draft.bodyMarkdown).slice(0, 700));
  return [
    { label: "Headline is 30–70 characters", ok: draft.title.length >= 30 && draft.title.length <= 70, weight: 20 },
    { label: "Standfirst is 80–200 characters (meta description)", ok: draft.dek.length >= 80 && draft.dek.length <= 200, weight: 15 },
    { label: "At least two section headings", ok: headings.length >= 2, weight: 15 },
    { label: "A heading phrased as a reader's question", ok: headings.some((h) => h.endsWith("?") || /^(why|how|what|when|should|is|do|can)\b/i.test(h)), weight: 15 },
    { label: "Opens with a direct answer (first paragraph under 60 words)", ok: firstPara.split(/\s+/).length > 0 && firstPara.split(/\s+/).length <= 60, weight: 10 },
    { label: "Lists its sources", ok: /^##\s+Sources/m.test(draft.bodyMarkdown), weight: 10 },
    { label: "Headline keyword appears in the opening", ok: titleWords.some((w) => opening.includes(w)), weight: 15 },
  ];
}

export function scoreDraft(args: { draft: DraftView; sources: SourceView[]; findings: Finding[]; voice: VoiceProfile | null }): QualityScores {
  const accuracy = accuracyScore(args.findings);
  const src = sourcesScore(args.draft, args.sources);
  const originality = originalityScore(args.draft, args.sources);
  const read = readabilityScore(args.draft);
  const checks = searchChecks(args.draft);
  const search = clamp(checks.filter((c) => c.ok).reduce((n, c) => n + c.weight, 0));
  const vm = args.voice ? voiceMatch(args.voice, args.draft.bodyMarkdown) : null;

  const weights: Array<[number, number]> = [
    [accuracy, 0.3],
    [src.score, 0.2],
    [originality, 0.15],
    [read.score, 0.15],
    [search, 0.1],
    ...(vm ? ([[vm.score, 0.1]] as Array<[number, number]>) : []),
  ];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const overall = clamp(weights.reduce((n, [v, w]) => n + v * w, 0) / total);

  const suggestions: Array<[number, string]> = [];
  const open = args.findings.filter((f) => !f.resolved && f.severity === "blocking");
  if (accuracy < 90 && open.length) suggestions.push([accuracy, `Resolve ${open.length} open reviewer finding${open.length > 1 ? "s" : ""}.`]);
  if (src.unknown) suggestions.push([src.score - 10, `Remove ${src.unknown} citation${src.unknown > 1 ? "s" : ""} to sources that weren't retrieved.`]);
  if (src.external < 2) suggestions.push([src.score, "Add an external source (a study, report or public data) behind the main claim."]);
  if (originality < 70) suggestions.push([originality, "Too much of the text is quoted from sources. Add your own experience and interpretation."]);
  if (read.avgSentence > 24) suggestions.push([read.score, `Sentences average ${read.avgSentence} words. Break up the longest ones.`]);
  else if (read.score < 70) suggestions.push([read.score, `Reading ease is ${read.ease}. Use shorter words and sentences.`]);
  for (const c of checks.filter((x) => !x.ok).slice(0, 2)) suggestions.push([search, `Search: ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}.`]);
  if (vm && vm.score < 75) for (const n of vm.notes.slice(0, 1)) suggestions.push([vm.score, `Voice: ${n}`]);

  return {
    overall,
    accuracy,
    sources: src.score,
    originality,
    voice: vm?.score ?? null,
    readability: read.score,
    search,
    suggestions: suggestions.sort((a, b) => a[0] - b[0]).map(([, s]) => s).slice(0, 5),
  };
}

export const QUALITY_LABELS: Array<{ key: keyof Omit<QualityScores, "overall" | "suggestions">; label: string; hint: string }> = [
  { key: "accuracy", label: "Accuracy", hint: "Open reviewer findings: unsupported figures, scope, boundaries" },
  { key: "sources", label: "Sources", hint: "External sources cited, and how many factual sentences carry a citation" },
  { key: "originality", label: "Originality", hint: "How much is your own thinking rather than quoted source text" },
  { key: "voice", label: "Voice match", hint: "Distance from your measured voice profile" },
  { key: "readability", label: "Readability", hint: "Flesch reading ease and sentence length" },
  { key: "search", label: "Search", hint: "SEO basics and what AI answer engines quote" },
];
