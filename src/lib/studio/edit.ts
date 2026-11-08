import { escapeRegExp, replacePhrase } from "./text";

/**
 * Highlight-and-ask. The founder selects a passage on the review page and
 * types an instruction. With Naïve connected, the writer agent rewrites the
 * passage; without it, this deterministic editor handles the instructions it
 * can do faithfully (replace, remove, shorten, list, formality) and says so
 * plainly when it can't, rather than pretending.
 */

export type Instruction =
  | { kind: "replace"; from: string; to: string }
  | { kind: "avoid"; phrase: string }
  | { kind: "remove" }
  | { kind: "shorten" }
  | { kind: "casual" }
  | { kind: "formal" }
  | { kind: "list" }
  | { kind: "unknown" };

const Q = `["“”'‘’]?`;
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’.]+$/g, "").trim();

export function parseInstruction(raw: string): Instruction {
  const s = raw.trim().replace(/\s+/g, " ");
  let m = s.match(new RegExp(`^(?:please )?(?:replace|swap) ${Q}(.+?)${Q} (?:with|by|for) ${Q}(.+?)${Q}\\.?$`, "i"));
  if (m) return { kind: "replace", from: unquote(m[1]!), to: unquote(m[2]!) };
  m = s.match(new RegExp(`^(?:please )?change ${Q}(.+?)${Q} (?:to|into) ${Q}(.+?)${Q}\\.?$`, "i"));
  if (m) return { kind: "replace", from: unquote(m[1]!), to: unquote(m[2]!) };
  m = s.match(new RegExp(`^(?:please |always )?(?:use|say|write) ${Q}(.+?)${Q} (?:instead of|not|rather than) ${Q}(.+?)${Q}\\.?$`, "i"));
  if (m) return { kind: "replace", from: unquote(m[2]!), to: unquote(m[1]!) };
  m = s.match(new RegExp(`^(?:please )?(?:never|don'?t|do not|stop|avoid) (?:say(?:ing)?|us(?:e|ing)|writ(?:e|ing))? ?${Q}(.+?)${Q}\\.?$`, "i"));
  if (m && m[1]!.split(" ").length <= 6) return { kind: "avoid", phrase: unquote(m[1]!) };
  if (/^(?:please )?(?:remove|delete|cut|drop)(?: (?:this|it|that|the (?:sentence|paragraph|line|passage)))?\.?$/i.test(s)) return { kind: "remove" };
  if (/\b(shorter|shorten|tighten|more concise|concise|trim|briefer|cut (?:it )?down|condense)\b/i.test(s)) return { kind: "shorten" };
  if (/\b(bullet|bulleted|as a list|into a list|list form)\b/i.test(s)) return { kind: "list" };
  if (/\b(casual|conversational|friendlier|less formal|relaxed|warmer)\b/i.test(s)) return { kind: "casual" };
  if (/\b(more formal|formal|professional|less casual)\b/i.test(s)) return { kind: "formal" };
  return { kind: "unknown" };
}

const CONTRACT: Array<[RegExp, string]> = [
  [/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"], [/\bdid not\b/gi, "didn't"], [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"], [/\bcannot\b/gi, "can't"], [/\bwill not\b/gi, "won't"], [/\bit is\b/gi, "it's"], [/\bthat is\b/gi, "that's"],
  [/\bwe are\b/gi, "we're"], [/\bwe have\b/gi, "we've"], [/\bI am\b/g, "I'm"], [/\bI have\b/g, "I've"], [/\bthey are\b/gi, "they're"], [/\byou are\b/gi, "you're"],
];

function contract(text: string): string {
  return CONTRACT.reduce((t, [re, short]) => t.replace(re, (m) => (m[0] === m[0]!.toUpperCase() ? short[0]!.toUpperCase() + short.slice(1) : short)), text);
}

function expand(text: string): string {
  return CONTRACT.reduce((t, [re, short]) => {
    const long = re.source.replace(/\\b/g, "");
    return t.replace(new RegExp(`\\b${escapeRegExp(short)}\\b`, "gi"), (m) => (m[0] === m[0]!.toUpperCase() ? long[0]!.toUpperCase() + long.slice(1) : long));
  }, text);
}

const CITE = /\s*\[(?:S|N)\d+\]/g;

function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?](?:\s*\[(?:S|N)\d+\])*)\s+(?=[A-Z0-9“"(*])/).filter(Boolean);
}

/** Keep every citation that was in the passage, even when its sentence goes. */
function keepCitations(original: string, result: string): string {
  const had = [...new Set(original.match(/\[(?:S|N)\d+\]/g) ?? [])];
  const missing = had.filter((c) => !result.includes(c));
  return missing.length ? `${result.replace(/\s+$/, "")} ${missing.join(" ")}` : result;
}

export type EditResult = { ok: true; replacement: string; summary: string } | { ok: false; reason: string };

export function localSelectionEdit(selection: string, instruction: string): EditResult {
  const rule = parseInstruction(instruction);
  switch (rule.kind) {
    case "replace": {
      const r = replacePhrase(selection, rule.from, rule.to);
      if (!r.count) return { ok: false, reason: `“${rule.from}” doesn't appear in the highlighted text.` };
      return { ok: true, replacement: r.text, summary: `Replaced “${rule.from}” with “${rule.to}”${r.count > 1 ? ` (${r.count}×)` : ""}.` };
    }
    case "avoid": {
      const re = new RegExp(`(?<![\\w-])${escapeRegExp(rule.phrase)}(?![\\w-])`, "gi");
      if (!re.test(selection)) return { ok: false, reason: `“${rule.phrase}” doesn't appear in the highlighted text.` };
      const out = selection.replace(re, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
      return { ok: true, replacement: out, summary: `Removed “${rule.phrase}”.` };
    }
    case "remove":
      return { ok: true, replacement: "", summary: "Removed the passage." };
    case "shorten": {
      const sents = splitSentences(selection);
      if (sents.length >= 2) {
        const keep = sents.slice(0, Math.max(1, Math.ceil(sents.length / 2)));
        return { ok: true, replacement: keepCitations(selection, keep.join(" ")), summary: `Kept ${keep.length} of ${sents.length} sentences.` };
      }
      const plain = selection.replace(CITE, "").trim();
      const cut = plain.replace(/\s*\([^)]*\)/g, "").replace(/,\s*(?:which|who|where|and|but)\b[^,.]*(?=[,.]|$)/gi, "");
      if (cut.length < plain.length - 5) return { ok: true, replacement: keepCitations(selection, cut.trim()), summary: "Cut the aside from the sentence." };
      return { ok: false, reason: "It's already one short sentence. Connect Naïve for free-form rewrites, or edit the text directly." };
    }
    case "list": {
      const sents = splitSentences(selection);
      if (sents.length < 2) return { ok: false, reason: "A list needs at least two sentences in the highlighted text." };
      return { ok: true, replacement: sents.map((s) => `- ${s.replace(/^[-*•]\s*/, "")}`).join("\n"), summary: `Turned ${sents.length} sentences into a list.` };
    }
    case "casual": {
      const out = contract(selection);
      return out === selection ? { ok: false, reason: "Nothing to loosen: no contractions to make." } : { ok: true, replacement: out, summary: "Made it more conversational (contractions)." };
    }
    case "formal": {
      const out = expand(selection);
      return out === selection ? { ok: false, reason: "Nothing to formalise: no contractions to expand." } : { ok: true, replacement: out, summary: "Made it more formal (no contractions)." };
    }
    default:
      return {
        ok: false,
        reason: "The built-in editor can replace or remove words, shorten, turn sentences into a list, or change formality. Free-form rewrites need the Naïve writer agent connected.",
      };
  }
}

/**
 * Find a passage selected on the rendered page inside the Markdown source.
 * Rendering drops markup (**bold**, [S1] brackets, link targets, list and
 * heading markers) and collapses whitespace, so match on a normalised copy
 * that remembers where each character came from.
 */
export function locateSelection(markdown: string, selection: string): { start: number; end: number } | null {
  const norm: string[] = [];
  const map: number[] = [];
  let i = 0;
  let atLineStart = true;
  const push = (ch: string, at: number) => {
    if (/\s/.test(ch)) {
      if (norm.length && norm[norm.length - 1] !== " ") {
        norm.push(" ");
        map.push(at);
      }
      return;
    }
    norm.push(ch);
    map.push(at);
  };
  while (i < markdown.length) {
    const rest = markdown.slice(i);
    if (atLineStart) {
      const marker = rest.match(/^(?:#{1,6}\s+|\s*(?:[-*•]|\d+[.)])\s+|>\s?)/);
      if (marker) {
        i += marker[0].length;
        atLineStart = false;
        continue;
      }
    }
    const link = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (link) {
      for (let k = 0; k < link[1]!.length; k++) push(link[1]![k]!, i + 1 + k);
      i += link[0].length;
      atLineStart = false;
      continue;
    }
    const cite = rest.match(/^\[((?:S|N)\d+)\]/);
    if (cite) {
      for (let k = 0; k < cite[1]!.length; k++) push(cite[1]![k]!, i + 1 + k);
      i += cite[0].length;
      continue;
    }
    const ch = markdown[i]!;
    if (ch === "*" || ch === "_" || ch === "`") {
      i++;
      continue;
    }
    push(ch, i);
    atLineStart = ch === "\n";
    i++;
  }
  const hay = norm.join("");
  const needle = selection.replace(/\s+/g, " ").trim();
  if (needle.length < 3) return null;
  let at = hay.indexOf(needle);
  if (at < 0) at = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  let start = map[at]!;
  let end = map[at + needle.length - 1]! + 1;
  // Pull in markup that wraps the selection: [S1] brackets, **bold** markers.
  while (start > 0 && /[[*_`]/.test(markdown[start - 1]!)) start--;
  while (end < markdown.length && /[\]*_`]/.test(markdown[end]!)) end++;
  return { start, end };
}

export function applySelectionEdit(markdown: string, range: { start: number; end: number }, replacement: string): string {
  const before = markdown.slice(0, range.start);
  const after = markdown.slice(range.end);
  if (!replacement.trim()) {
    return `${before.replace(/[ \t]+$/, "")}${after.replace(/^[ \t]+/, before.endsWith("\n") || !before ? "" : " ")}`.replace(/\n{3,}/g, "\n\n");
  }
  // A list inside a paragraph needs its own block.
  if (replacement.includes("\n- ") || replacement.startsWith("- ")) {
    return `${before.replace(/\s+$/, "")}\n\n${replacement}\n\n${after.replace(/^\s+/, "")}`.replace(/\n{3,}/g, "\n\n");
  }
  return `${before}${replacement}${after}`;
}
