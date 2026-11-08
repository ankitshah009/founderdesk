import type { Finding } from "@/lib/db/schema";

/**
 * Humanizer: measurable signs of machine-written prose. These send a draft
 * back for one more revision; they never stop an order or block publishing
 * (style is a matter of taste, the founder has the final say).
 *
 * The goal is writing that sounds like the founder, not writing that evades
 * AI detectors, so every rule targets something a human editor would cut.
 */

export const STYLE_RULES = [
  "Sound like the founder talking to a peer: use their own words and examples from the notes.",
  "Vary sentence length. Mix short sentences with longer ones; never three sentences of similar length in a row.",
  "No stock phrases: \"in today's fast-paced world\", \"delve\", \"navigate the landscape\", \"game-changer\", \"unlock\", \"leverage\", \"robust\", \"seamless\", \"it's worth noting\", \"in conclusion\", \"at the end of the day\".",
  "Avoid \"It's not X, it's Y\" constructions and reflexive lists of three.",
  "At most one em dash per paragraph. Prefer a full stop.",
  "No summary paragraph that repeats earlier points. End on a concrete next step or an open question.",
  "Concrete over abstract: a number, a name of a tool, a moment that happened, instead of a general claim.",
] as const;

export const PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\bin today'?s (fast-paced|digital|ever-changing|rapidly evolving)\b/i, "in today's … world"],
  [/\bdelv(e|es|ing)\b/i, "delve"],
  [/\bnavigat(e|ing) (the|this) (landscape|complexities|world)\b/i, "navigate the landscape"],
  [/\bgame[- ]chang(er|ing)\b/i, "game-changer"],
  [/\bunlock(s|ing)? (the )?(full )?(potential|power|value)\b/i, "unlock the potential"],
  [/\b(seamless(ly)?|robust|cutting-edge|revolutioni[sz]e)\b/i, "hype adjective"],
  [/\bit'?s (worth|important to) not(e|ing)\b/i, "it's worth noting"],
  [/\bin conclusion\b|\bat the end of the day\b|\bin summary\b/i, "summary filler"],
  [/\btapestry\b|\btestament to\b|\bever-evolving\b|\brealm of\b/i, "ornamental cliché"],
  [/\b(let'?s dive in|without further ado|buckle up)\b/i, "throat-clearing opener"],
];

const NOT_X_BUT_Y = /\b(it'?s|this is|that'?s) not (just |only |merely )?[^.?!]{1,60}[,;—-]+\s*(it'?s|but)\b/gi;

function prose(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|[-*] |\d+\. |>|```)/.test(p) && !/^\[?S\d+\]?/.test(p))
    .map((p) => p.replace(/\[(S|N)\d+\]/g, "").replace(/[*_`]/g, ""));
}

function sentenceLengths(paragraph: string): number[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 2);
}

export type StyleReport = { issues: Array<{ kind: string; detail: string; fix: string }>; burstiness: number | null };

export function styleReport(body: string): StyleReport {
  const main = body.split(/^##\s+Sources/m)[0] ?? body;
  const paras = prose(main);
  const text = paras.join("\n\n");
  const issues: StyleReport["issues"] = [];

  const hits = PHRASES.filter(([re]) => re.test(text)).map(([, label]) => label);
  if (hits.length) {
    issues.push({ kind: "stock_phrases", detail: `Stock phrasing: ${hits.join(", ")}.`, fix: "Replace each with the plain, specific thing it stands for, in the founder's words." });
  }

  const notXbutY = text.match(NOT_X_BUT_Y)?.length ?? 0;
  if (notXbutY >= 2) issues.push({ kind: "not_x_but_y", detail: `${notXbutY} "it's not X, it's Y" constructions.`, fix: "Keep at most one; state the point directly." });

  const dashes = paras.filter((p) => (p.match(/—/g)?.length ?? 0) > 1).length;
  if (dashes >= 2) issues.push({ kind: "em_dashes", detail: `${dashes} paragraphs use more than one em dash.`, fix: "At most one em dash per paragraph; use full stops." });

  // Burstiness: coefficient of variation of sentence length. Human prose
  // usually sits well above 0.4; uniform machine rhythm sits below it.
  const lens = paras.flatMap(sentenceLengths);
  let burstiness: number | null = null;
  if (lens.length >= 8) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    burstiness = Math.round((sd / mean) * 100) / 100;
    if (burstiness < 0.35) {
      issues.push({ kind: "flat_rhythm", detail: `Sentence lengths are uniform (variation ${burstiness}).`, fix: "Vary sentence length: add some short, punchy sentences and let a few run longer." });
    }
  }

  const lastPara = paras.at(-1) ?? "";
  if (/^(in (short|summary|conclusion)|overall|ultimately|to sum up)\b/i.test(lastPara)) {
    issues.push({ kind: "summary_ending", detail: "The article ends with a summary of itself.", fix: "Cut the recap; end on a concrete next step or a question for the reader." });
  }

  const triads = (text.match(/\b\w+, \w+,? and \w+\b/g) ?? []).length;
  if (paras.length && triads / paras.length > 0.6) {
    issues.push({ kind: "triads", detail: `${triads} lists of three across ${paras.length} paragraphs.`, fix: "Break the rule-of-three habit; list only what matters." });
  }
  return { issues, burstiness };
}

export function styleFindings(body: string, fid: (kind: string) => string): Finding[] {
  return styleReport(body).issues.map((i) => ({ id: `style-${fid(i.kind)}`, severity: "blocking" as const, kind: `style_${i.kind}`, claim: i.detail, proposedFix: i.fix }));
}

/** Findings that may trigger a revision but must never stop an order or block publishing. */
export function isSoftFinding(f: Pick<Finding, "id">): boolean {
  return f.id.startsWith("agent-") || f.id.startsWith("style-");
}
