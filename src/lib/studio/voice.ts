import type { VoiceProfile } from "@/lib/db/schema";
import { clamp, mean, proseOf, readingEase, sentencesOf, stdev, wordsOf } from "./text";

/**
 * Brand voice: a measurable fingerprint of how the founder writes, learned
 * from their own blogs, newsletters and posts. The writer is briefed with it,
 * and every draft is scored against it.
 */

const CONTRACTION = /\b[a-z]+['’](?:s|t|re|ve|ll|d|m)\b/gi;
const FIRST_PERSON = /\b(i|i'm|i’m|i've|i’ve|we|we're|we’re|we've|we’ve|my|our|us|me)\b/gi;
const STOP = new Set(
  "a an the and or but of to in on at for with from by as is are was were be been it its this that these those you your we our i my they their he she his her them not no so if then than there here what which who how why when also just very really into about over more most can could would should will".split(" "),
);

type Stats = {
  words: number;
  sentences: number;
  avgSentenceLength: number;
  sentenceLengthSpread: number;
  contractionRate: number;
  firstPersonRate: number;
  questionRate: number;
  exclamationRate: number;
  readingEase: number;
};

export function textStats(raw: string): Stats {
  const text = proseOf(raw);
  const sents = sentencesOf(text);
  const words = wordsOf(text);
  const lengths = sents.map((s) => s.split(/\s+/).length);
  const per100 = (n: number) => (words.length ? (n / words.length) * 100 : 0);
  return {
    words: words.length,
    sentences: sents.length,
    avgSentenceLength: Number(mean(lengths).toFixed(1)),
    sentenceLengthSpread: Number(stdev(lengths).toFixed(1)),
    contractionRate: Number(per100((text.match(CONTRACTION) ?? []).length).toFixed(2)),
    firstPersonRate: Number(per100((text.match(FIRST_PERSON) ?? []).length).toFixed(2)),
    questionRate: Number((sents.length ? sents.filter((s) => s.endsWith("?")).length / sents.length : 0).toFixed(3)),
    exclamationRate: Number((sents.length ? sents.filter((s) => s.endsWith("!")).length / sents.length : 0).toFixed(3)),
    readingEase: readingEase(text),
  };
}

/** Two- and three-word phrases the founder reuses across samples. */
function signaturePhrases(samples: string[]): string[] {
  const counts = new Map<string, { n: number; docs: Set<number> }>();
  samples.forEach((sample, doc) => {
    const words = wordsOf(proseOf(sample));
    for (const size of [2, 3]) {
      for (let i = 0; i + size <= words.length; i++) {
        const gram = words.slice(i, i + size);
        if (gram.every((w) => STOP.has(w)) || STOP.has(gram[0]!) || STOP.has(gram[size - 1]!) || gram.some((w) => /^\d+$/.test(w))) continue;
        const key = gram.join(" ");
        const c = counts.get(key) ?? { n: 0, docs: new Set<number>() };
        c.n++;
        c.docs.add(doc);
        counts.set(key, c);
      }
    }
  });
  const needDocs = samples.length > 1 ? 2 : 1;
  const ranked = [...counts.entries()]
    .filter(([, c]) => c.n >= 2 && c.docs.size >= needDocs)
    .sort((a, b) => b[1].docs.size - a[1].docs.size || b[1].n - a[1].n || b[0].split(" ").length - a[0].split(" ").length);
  const out: string[] = [];
  for (const [p] of ranked) {
    if (out.some((q) => q.includes(p) || p.includes(q))) continue;
    out.push(p);
    if (out.length >= 6) break;
  }
  return out;
}

function traitsOf(s: Stats): string[] {
  const t: string[] = [];
  t.push(s.avgSentenceLength < 14 ? "Short, direct sentences" : s.avgSentenceLength > 22 ? "Long, layered sentences" : "Medium-length sentences");
  if (s.sentenceLengthSpread >= 7) t.push("Varies sentence rhythm");
  if (s.contractionRate >= 1.5) t.push("Conversational: uses contractions");
  else if (s.contractionRate < 0.4) t.push("Formal: avoids contractions");
  if (s.firstPersonRate >= 3) t.push("Writes in the first person");
  if (s.questionRate >= 0.06) t.push("Asks the reader questions");
  if (s.exclamationRate >= 0.03) t.push("Uses exclamation marks");
  t.push(s.readingEase >= 60 ? "Plain-spoken and easy to read" : s.readingEase < 40 ? "Dense and technical" : "Moderately technical");
  return t;
}

export function analyzeVoice(samples: string[], now = new Date()): VoiceProfile | null {
  const usable = samples.map((s) => s.trim()).filter((s) => wordsOf(proseOf(s)).length >= 40);
  if (!usable.length) return null;
  const s = textStats(usable.join("\n\n"));
  return {
    sampleCount: usable.length,
    words: s.words,
    avgSentenceLength: s.avgSentenceLength,
    sentenceLengthSpread: s.sentenceLengthSpread,
    contractionRate: s.contractionRate,
    firstPersonRate: s.firstPersonRate,
    questionRate: s.questionRate,
    exclamationRate: s.exclamationRate,
    readingEase: s.readingEase,
    signaturePhrases: signaturePhrases(usable),
    traits: traitsOf(s),
    analyzedAt: now.toISOString(),
  };
}

/** How closely a draft matches the founder's voice, 0–100, with the biggest gaps. */
export function voiceMatch(profile: VoiceProfile, draft: string): { score: number; notes: string[] } {
  const d = textStats(draft);
  if (!d.sentences) return { score: 0, notes: ["The draft has no prose to compare."] };
  const gaps: Array<{ penalty: number; note: string }> = [];
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1);
  const lenGap = rel(d.avgSentenceLength, profile.avgSentenceLength);
  gaps.push({ penalty: Math.min(30, lenGap * 45), note: `Sentences average ${Math.round(d.avgSentenceLength)} words; yours average ${Math.round(profile.avgSentenceLength)}.` });
  const contractionGap = Math.abs(d.contractionRate - profile.contractionRate);
  gaps.push({ penalty: Math.min(20, contractionGap * 8), note: d.contractionRate < profile.contractionRate ? "Fewer contractions than you use; it reads stiffer than you." : "More contractions than you use; it reads looser than you." });
  const fpGap = Math.abs(d.firstPersonRate - profile.firstPersonRate);
  gaps.push({ penalty: Math.min(20, fpGap * 4), note: d.firstPersonRate < profile.firstPersonRate ? "Less first person (I, we) than you write." : "More first person than you usually write." });
  const easeGap = Math.abs(d.readingEase - profile.readingEase);
  gaps.push({ penalty: Math.min(20, easeGap * 0.6), note: d.readingEase < profile.readingEase ? "Harder to read than your own writing." : "Simpler than your own writing." });
  const qGap = Math.abs(d.questionRate - profile.questionRate);
  gaps.push({ penalty: Math.min(10, qGap * 80), note: d.questionRate < profile.questionRate ? "You ask readers more questions than this draft does." : "Asks more questions than you usually do." });
  const lower = proseOf(draft).toLowerCase();
  const used = profile.signaturePhrases.filter((p) => lower.includes(p)).length;
  const bonus = profile.signaturePhrases.length ? Math.min(8, used * 4) : 0;
  const score = clamp(100 - gaps.reduce((n, g) => n + g.penalty, 0) + bonus);
  const notes = gaps
    .filter((g) => g.penalty >= 4)
    .sort((a, b) => b.penalty - a.penalty)
    .slice(0, 3)
    .map((g) => g.note);
  return { score, notes };
}

/** The voice profile as writing instructions for the writer agent. */
export function voiceBrief(p: VoiceProfile): string {
  return [
    `Match the founder's measured voice (learned from ${p.sampleCount} of their own pieces):`,
    `- Average sentence length about ${Math.round(p.avgSentenceLength)} words, varying by about ${Math.round(p.sentenceLengthSpread)}.`,
    `- ${p.contractionRate >= 1.5 ? "Use contractions freely." : p.contractionRate < 0.4 ? "Avoid contractions." : "Use contractions occasionally."}`,
    `- ${p.firstPersonRate >= 3 ? "Write in the first person (I/we)." : "Use the first person sparingly."}`,
    `- Target a Flesch reading ease near ${p.readingEase}.`,
    p.signaturePhrases.length ? `- Phrases they naturally use (only where they fit): ${p.signaturePhrases.map((s) => `"${s}"`).join(", ")}.` : null,
    `- Traits: ${p.traits.join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
