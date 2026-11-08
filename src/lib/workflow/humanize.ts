import type { ChannelVariants, Finding } from "@/lib/db/schema";

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

/* ── Post depth ───────────────────────────────────────────────────────────── */

export const INSIGHT_RULES = [
  "Lead with the most surprising specific thing in the article: a number, a named company, a result that contradicts common advice. Never open with a generic truism.",
  "Every post or slide carries one concrete item: a named example with its number, a mechanism (why it happens), or a step the reader can apply today.",
  "Give the reader a tool they can use: a test, a threshold, a short checklist or a question to ask their own data. Say exactly what to measure and what result means what.",
  "If evidence for a point is weak, leave the point out. Never hedge in public posts (no 'one guide says', 'test that claim before you bank on it', 'a hypothesis, not a finding').",
  "Write as the founder speaking from experience: 'we', 'I', what they did and saw. Opinions are welcome when the founder's notes support them.",
  "Hashtags name topics people follow (#SaaS, #StartupStrategy), never a company or person from the article.",
] as const;

export const FORMAT_RULES = [
  "`x` is a thread of 6–9 posts, each at most 280 characters. X ranks posts with links lower, so no link anywhere except the last post. Post 1 is a standalone hook under 200 characters with a number or named example — it must make sense if it is the only post someone sees. Then one idea per post with its evidence, short lines and white space; a 'how to apply this' post with 2–4 concrete steps; the last post gives the takeaway and {{url}}. No hashtags, no '1/' numbering.",
  "`xSingle` is one standalone post of at most 280 characters including {{url}} (count the link as 23): the single sharpest insight with its number or named example, and what to do about it.",
  "`linkedin` is one post of 1,300–2,400 characters. LinkedIn shows about 210 characters before 'see more', so the first two lines (under 210 characters together) must name a specific result and create a reason to expand. Then a short first-person story of what the founder saw; 3–5 numbered lessons ('1.' at line start), each with a concrete example, number or step; one- or two-sentence paragraphs with blank lines between; a closing question that invites a specific answer in the comments; then {{url}} on its own line near the end (LinkedIn limits reach for links high in a post); then a final line of 3–5 specific topic hashtags.",
  "`newsletter` is { subject (under 50 characters so it is not cut off on phones, specific, no clickbait), preview (one line that adds to the subject), body (300–600 words in the founder's voice: the key finding, why it matters, what to do this week, ending with {{url}}) }.",
  "`instagram` is { slides: 8–10 slides, 8–25 words each (big text on a square image, so short lines), one idea per slide; slide 1 is a specific hook that stops the scroll; the middle slides are the steps or examples; the second-to-last is a one-line summary worth saving; the last says 'Save this for later · Full article: link in bio'. caption: the first line (under 125 characters, the part shown before 'more') restates the hook; then 3–5 short lines that add context Instagram users will not get from the slides, a prompt to save or share, and 3–5 topic hashtags. Links in captions are not clickable, so never put a URL in it }.",
] as const;

const HEDGES = /\b(one [\w-]+ (guide|post|article|vendor|source) (says|defines|claims)|test (that|this) claim|before you bank on it|a hypothesis, not a finding|evidence (on|for) [^.]{0,40} is thinner|some (say|argue)|it remains to be seen)\b/i;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Thin or hedging channel posts go back for a rewrite; never blocks publication. */
export function variantDepthFindings(v: ChannelVariants, fid: (kind: string) => string): Finding[] {
  const out: Array<{ kind: string; claim: string; fix: string }> = [];
  if (v.x && v.x.length < 6) out.push({ kind: "thin_x_thread", claim: `The X thread has ${v.x.length} posts.`, fix: "Write 6–9 posts: hook with a number, one idea per post with evidence, a how-to-apply post, takeaway with the link." });
  if (v.xSingle && !/\d/.test(v.xSingle.replace(/\{\{url\}\}|https?:\/\/\S+/g, ""))) {
    out.push({ kind: "vague_x_post", claim: "The single X post has no number or concrete result.", fix: "Lead with the sharpest specific: a number or named example, then what to do about it." });
  }
  if (v.linkedin && v.linkedin.length < 1100) out.push({ kind: "thin_linkedin", claim: `The LinkedIn post is ${v.linkedin.length} characters.`, fix: "Expand to 1,300–2,400 characters with 3–5 numbered lessons, each carrying an example, number or step." });
  if (v.linkedin && !/^\s*(\d+[.)]|[1-9]️⃣)/m.test(v.linkedin)) out.push({ kind: "linkedin_no_lessons", claim: "The LinkedIn post has no numbered, concrete lessons.", fix: "Add 3–5 numbered lessons the reader can apply." });
  if (v.instagram) {
    const short = v.instagram.slides.filter((sl) => countWords(sl) < 6).length;
    if (v.instagram.slides.length < 8 || short > 2) {
      out.push({ kind: "thin_carousel", claim: `The carousel has ${v.instagram.slides.length} slides, ${short} of them under six words.`, fix: "Write 8–10 slides of 8–25 words, each with one concrete point." });
    }
  }
  if (v.newsletter && countWords(v.newsletter.body) < 250) out.push({ kind: "thin_newsletter", claim: `The newsletter issue is ${countWords(v.newsletter.body)} words.`, fix: "Write 300–600 words: key finding, why it matters, what to do this week." });
  if (v.x?.length && /https?:\/\/|\{\{url\}\}/.test(v.x.slice(0, -1).join(" "))) out.push({ kind: "x_early_link", claim: "An X post before the last one carries a link, which X ranks lower.", fix: "Keep {{url}} only in the last post." });
  if (v.x?.[0] && v.x[0].length > 200) out.push({ kind: "x_long_hook", claim: `The first X post is ${v.x[0].length} characters.`, fix: "Make the hook under 200 characters with one number or named example." });
  if (v.linkedin) {
    const lines = v.linkedin.split(/\n/).filter((l) => l.trim());
    const fold = (lines[0] ?? "").length + (lines[1] ?? "").length;
    if (fold > 210) out.push({ kind: "linkedin_fold", claim: `The LinkedIn hook runs ${fold} characters before 'see more' (about 210 show).`, fix: "Make the first two lines under 210 characters and name a specific result." });
    const at = v.linkedin.search(/\{\{url\}\}|https?:\/\//);
    if (at >= 0 && at < v.linkedin.length * 0.6) out.push({ kind: "linkedin_early_link", claim: "The LinkedIn link sits high in the post, which limits reach.", fix: "Move {{url}} near the end, after the closing question." });
  }
  if (v.instagram?.caption) {
    if (/https?:\/\/|\{\{url\}\}/.test(v.instagram.caption)) out.push({ kind: "ig_caption_link", claim: "The Instagram caption has a link, which Instagram does not make clickable.", fix: "Say 'link in bio' instead." });
    const first = v.instagram.caption.split(/\n/)[0] ?? "";
    if (first.length > 125) out.push({ kind: "ig_caption_hook", claim: `The caption's first line is ${first.length} characters; about 125 show before 'more'.`, fix: "Restate the hook in under 125 characters on the first line." });
  }
  if (v.newsletter && v.newsletter.subject.length > 50) out.push({ kind: "newsletter_subject", claim: `The subject line is ${v.newsletter.subject.length} characters and will be cut off on phones.`, fix: "Keep the subject under 50 characters." });
  const all = [...(v.x ?? []), v.xSingle ?? "", v.linkedin ?? "", v.instagram?.caption ?? "", ...(v.instagram?.slides ?? []), v.newsletter?.body ?? ""].join("\n");
  const hedge = all.match(HEDGES)?.[0];
  if (hedge) out.push({ kind: "hedging", claim: `Public posts hedge ("${hedge}").`, fix: "Drop points whose evidence is weak instead of hedging them; state what you are confident in." });
  return out.map((o) => ({ id: `style-${fid(o.kind)}`, severity: "blocking" as const, kind: `depth_${o.kind}`, claim: o.claim, proposedFix: o.fix }));
}
