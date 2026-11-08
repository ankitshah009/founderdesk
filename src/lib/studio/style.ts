import type { ChannelVariants, Finding, Memory, StyleGuide } from "@/lib/db/schema";
import { parseInstruction } from "./edit";
import { escapeRegExp, replacePhrase } from "./text";

/**
 * Style guide: the founder's preferred vocabulary, banned phrases, tone and
 * formatting rules. The Editor agent applies the vocabulary to every draft
 * (live or simulated); banned phrases it cannot fix on its own come back as
 * soft findings, so the writer revises them but they never block an order.
 */

export const EMPTY_STYLE: StyleGuide = { preferredTerms: [], bannedPhrases: [], tone: "", formatting: [] };

/**
 * Editorial memory that reads as a rule ("use teams instead of customers",
 * "never say synergy") becomes part of the effective style guide, so a
 * correction made once is applied to every later article.
 */
export function effectiveGuide(guide: StyleGuide, memories: Pick<Memory, "text" | "active">[]): StyleGuide {
  const preferredTerms = [...guide.preferredTerms];
  const bannedPhrases = [...guide.bannedPhrases];
  for (const m of memories) {
    if (!m.active) continue;
    const rule = parseInstruction(m.text);
    if (rule.kind === "replace" && !preferredTerms.some((t) => t.use.toLowerCase() === rule.to.toLowerCase() && t.insteadOf.includes(rule.from))) {
      preferredTerms.push({ use: rule.to, insteadOf: [rule.from] });
    } else if (rule.kind === "avoid" && !bannedPhrases.some((b) => b.toLowerCase() === rule.phrase.toLowerCase())) {
      bannedPhrases.push(rule.phrase);
    }
  }
  return { ...guide, preferredTerms, bannedPhrases };
}

export function applyTerms(text: string, guide: StyleGuide): { text: string; changes: Map<string, number> } {
  let out = text;
  const changes = new Map<string, number>();
  for (const term of guide.preferredTerms) {
    for (const from of term.insteadOf) {
      if (!from.trim() || from.toLowerCase() === term.use.toLowerCase()) continue;
      const r = replacePhrase(out, from, term.use);
      if (r.count) {
        out = r.text;
        const key = `“${from}” → “${term.use}”`;
        changes.set(key, (changes.get(key) ?? 0) + r.count);
      }
    }
  }
  return { text: out, changes };
}

type DraftText = { title: string; dek: string; bodyMarkdown: string; announcement: string; variants?: Partial<ChannelVariants> };

/** The Editor's vocabulary pass over every field that will be published. */
export function applyStyleGuide<T extends DraftText>(draft: T, guide: StyleGuide): { draft: T; changes: string[] } {
  const total = new Map<string, number>();
  const fix = (s: string) => {
    const r = applyTerms(s, guide);
    for (const [k, n] of r.changes) total.set(k, (total.get(k) ?? 0) + n);
    return r.text;
  };
  const v = draft.variants;
  const variants = v
    ? {
        ...v,
        ...(v.x ? { x: v.x.map(fix) } : {}),
        ...(v.xSingle ? { xSingle: fix(v.xSingle) } : {}),
        ...(v.linkedin ? { linkedin: fix(v.linkedin) } : {}),
        ...(v.newsletter ? { newsletter: { subject: fix(v.newsletter.subject), preview: fix(v.newsletter.preview), body: fix(v.newsletter.body) } } : {}),
        ...(v.instagram ? { instagram: { slides: v.instagram.slides.map(fix), caption: fix(v.instagram.caption) } } : {}),
      }
    : undefined;
  const out = { ...draft, title: fix(draft.title), dek: fix(draft.dek), bodyMarkdown: fix(draft.bodyMarkdown), announcement: fix(draft.announcement), ...(variants ? { variants } : {}) };
  return { draft: out, changes: [...total.entries()].map(([k, n]) => `${k}${n > 1 ? ` (${n}×)` : ""}`) };
}

export function bannedPhrasesIn(text: string, guide: StyleGuide): string[] {
  return guide.bannedPhrases.filter((p) => p.trim() && new RegExp(`(?<![\\w-])${escapeRegExp(p.trim())}(?![\\w-])`, "i").test(text));
}

/** Soft findings (id prefix "style-") for banned phrases left in the article. */
export function styleGuideFindings(body: string, guide: StyleGuide, fid: (kind: string) => string): Finding[] {
  return bannedPhrasesIn(body.split(/^##\s+Sources\b/im)[0] ?? body, guide).map((p) => ({
    id: `style-${fid("guide")}`,
    severity: "blocking" as const,
    kind: "style_guide",
    claim: `Uses “${p}”, which your style guide bans.`,
    proposedFix: `Rewrite without “${p}”.`,
  }));
}

/** The style guide as instructions for the writer and editor agents. */
export function styleBrief(g: StyleGuide): string | null {
  const lines = [
    g.tone ? `Tone: ${g.tone}` : null,
    ...g.preferredTerms.map((t) => `Say "${t.use}", not ${t.insteadOf.map((x) => `"${x}"`).join(" or ")}.`),
    g.bannedPhrases.length ? `Never use: ${g.bannedPhrases.map((p) => `"${p}"`).join(", ")}.` : null,
    ...g.formatting.map((f) => `Formatting: ${f}`),
  ].filter(Boolean);
  return lines.length ? `The founder's style guide:\n${lines.map((l) => `- ${l}`).join("\n")}` : null;
}

/** Parse the style-guide form's "use = instead, of" lines. */
export function parseTermLines(raw: string): StyleGuide["preferredTerms"] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [use, rest] = l.split(/\s*(?:=|←|<-|instead of|not)\s*/i, 2);
      return { use: (use ?? "").trim(), insteadOf: (rest ?? "").split(",").map((x) => x.trim()).filter(Boolean) };
    })
    .filter((t) => t.use && t.insteadOf.length)
    .slice(0, 50);
}

export function termLines(terms: StyleGuide["preferredTerms"]): string {
  return terms.map((t) => `${t.use} = ${t.insteadOf.join(", ")}`).join("\n");
}
