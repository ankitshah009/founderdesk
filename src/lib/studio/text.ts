/**
 * Small text statistics shared by the voice analyser, the quality score and
 * the editor. Deterministic and dependency-free, so every score the founder
 * sees can be reproduced from the text alone.
 */

/** The article's prose: no headings, list markers, citations or Sources section. */
export function proseOf(markdown: string): string {
  const main = markdown.split(/^##\s+Sources\b/im)[0] ?? markdown;
  return main
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/^>\s?/, ""))
    .join("\n")
    .replace(/\[(?:S|N)\d+\]/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`]/g, "");
}

export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) ?? [];
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch reading ease (higher is easier; 60–70 is plain English). */
export function readingEase(text: string): number {
  const sents = sentencesOf(text);
  const words = wordsOf(text);
  if (!sents.length || !words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return Math.round(206.835 - 1.015 * (words.length / sents.length) - 84.6 * (syl / words.length));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Match the case of `like` (ALL CAPS, Capitalised, or as given). */
export function matchCase(replacement: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase() && /[A-Z]/.test(like)) return replacement.toUpperCase();
  if (like[0] && like[0] === like[0].toUpperCase() && /[A-Z]/.test(like[0])) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/**
 * Replace a phrase as a whole word, case-insensitively, keeping the case of
 * each occurrence. Citations, URLs and the {{url}} placeholder are never touched.
 */
export function replacePhrase(text: string, from: string, to: string): { text: string; count: number } {
  if (!from.trim()) return { text, count: 0 };
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(from.trim())}(?![\\w-])`, "gi");
  let count = 0;
  const out = text
    .split(/(\[(?:S|N)\d+\]|https?:\/\/\S+|\{\{url\}\})/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(re, (m) => {
            count++;
            return matchCase(to, m);
          }),
    )
    .join("");
  return { text: out, count };
}
