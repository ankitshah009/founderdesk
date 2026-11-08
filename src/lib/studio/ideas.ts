import type { Persona, PostPlatform } from "@/lib/db/schema";
import { figures, keywords } from "@/lib/workflow/editorial";
import { clamp, mean } from "./text";

/**
 * Idea Lab. Six tools that judge an idea before it becomes an article or a
 * post, using the founder's own post history and the viral posts they've
 * captured from other creators (their swipe file):
 *
 *   Viral Twin Simulator · Audience Reaction Panel · Historical Analog Finder
 *   Hook Tournament · Trend Timing Radar · Controversy vs. Credibility
 *
 * Everything is computed from that data. Where there isn't enough of it, the
 * result says so (and which defaults it used) instead of inventing a number.
 */

export type PostRow = {
  id: string;
  author: string;
  platform: PostPlatform;
  text: string;
  url?: string | null;
  postedAt: Date | null;
  impressions: number | null;
  likes: number;
  comments: number;
  shares: number;
  followers: number | null;
};

/* ── Engagement, normalised for account size and platform ─────────────────── */

/** Weighted interactions per 1,000 followers (or impressions). Comments and shares count more than likes. */
export function engagement(p: PostRow): { value: number; basis: "followers" | "impressions" | "raw" } {
  const weighted = p.likes + 2 * p.comments + 3 * p.shares;
  if (p.followers && p.followers > 0) return { value: (weighted / p.followers) * 1000, basis: "followers" };
  if (p.impressions && p.impressions > 0) return { value: (weighted / p.impressions) * 1000, basis: "impressions" };
  return { value: weighted, basis: "raw" };
}

function percentileOf(value: number, population: number[]): number {
  if (population.length <= 1) return 50;
  const below = population.filter((v) => v < value).length;
  const equal = population.filter((v) => v === value).length;
  return clamp(((below + equal / 2) / population.length) * 100);
}

/** Each post's engagement percentile within its peer group: same author (if ≥5 posts) and platform. */
export function percentiles(posts: PostRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, PostRow[]>();
  for (const p of posts) {
    const byAuthor = posts.filter((q) => q.author === p.author && q.platform === p.platform).length >= 5;
    const key = byAuthor ? `${p.author}|${p.platform}` : `*|${p.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const group of groups.values()) {
    const values = group.map((p) => engagement(p).value);
    for (const p of group) out.set(p.id, percentileOf(engagement(p).value, values));
  }
  return out;
}

/* ── Similarity ───────────────────────────────────────────────────────────── */

function tfidf(docs: string[]): Array<Map<string, number>> {
  const toks = docs.map((d) => [...keywords(d)]);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  return toks.map((t) => {
    const v = new Map<string, number>();
    for (const w of t) v.set(w, Math.log(1 + docs.length / (df.get(w) ?? 1)));
    return v;
  });
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [k, y] of b) {
    nb += y * y;
    const x = a.get(k);
    if (x) dot += x * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function similarTo(text: string, posts: PostRow[]): Array<{ post: PostRow; sim: number; shared: string[] }> {
  const vecs = tfidf([text, ...posts.map((p) => p.text)]);
  const q = vecs[0]!;
  return posts
    .map((post, i) => ({ post, sim: cosine(q, vecs[i + 1]!), shared: [...q.keys()].filter((k) => vecs[i + 1]!.has(k)).slice(0, 5) }))
    .filter((x) => x.sim > 0.04)
    .sort((a, b) => b.sim - a.sim);
}

/* ── Hook features and what this audience rewards ───────────────────────── */

export const FEATURES = {
  number: { label: "Leads with a number", test: (t: string) => /\d/.test(firstLine(t)) },
  question: { label: "Opens with a question", test: (t: string) => firstLine(t).trim().endsWith("?") },
  firstPerson: { label: "First person (I / we)", test: (t: string) => /\b(i|we|my|our)\b/i.test(firstLine(t)) },
  contrarian: { label: "Contrarian", test: (t: string) => /\b(stop|never|wrong|myth|overrated|unpopular|nobody|actually|don'?t)\b/i.test(firstLine(t)) },
  story: { label: "Story opener", test: (t: string) => /\b(last (year|week|month)|yesterday|when (i|we)|i was|we were|years ago)\b/i.test(firstLine(t)) },
  howTo: { label: "How-to", test: (t: string) => /\bhow (to|i|we)\b/i.test(firstLine(t)) },
  list: { label: "Numbered list", test: (t: string) => /^\s*\d+\s+(things|ways|lessons|mistakes|reasons|steps)\b/i.test(firstLine(t)) || /\n\s*(?:\d+[.)]|[-•])\s/.test(t) },
  short: { label: "Short hook (under 80 characters)", test: (t: string) => firstLine(t).length < 80 },
} as const;
export type FeatureKey = keyof typeof FEATURES;

function firstLine(t: string): string {
  return t.trim().split(/\n|(?<=[.!?])\s/)[0] ?? "";
}

/** Default lifts used only when the founder has too little history. Labelled as defaults wherever shown. */
const DEFAULT_LIFT: Record<FeatureKey, number> = { number: 6, question: 2, firstPerson: 4, contrarian: 5, story: 4, howTo: 3, list: 3, short: 2 };

export type Lifts = { lifts: Record<FeatureKey, number>; fromData: Record<FeatureKey, boolean>; basis: number };

/**
 * What this founder's audience rewards: for each hook feature, how many
 * percentile points posts with it beat posts without it, shrunk toward the
 * default when the evidence is thin.
 */
export function learnLifts(posts: PostRow[], pct: Map<string, number>): Lifts {
  const lifts = { ...DEFAULT_LIFT };
  const fromData = Object.fromEntries(Object.keys(FEATURES).map((k) => [k, false])) as Record<FeatureKey, boolean>;
  for (const key of Object.keys(FEATURES) as FeatureKey[]) {
    const withF = posts.filter((p) => FEATURES[key].test(p.text)).map((p) => pct.get(p.id) ?? 50);
    const without = posts.filter((p) => !FEATURES[key].test(p.text)).map((p) => pct.get(p.id) ?? 50);
    if (withF.length >= 2 && without.length >= 2) {
      const observed = mean(withF) - mean(without);
      const w = Math.min(withF.length, without.length) / (Math.min(withF.length, without.length) + 5);
      lifts[key] = Math.round(observed * w + DEFAULT_LIFT[key] * (1 - w));
      fromData[key] = true;
    }
  }
  return { lifts, fromData, basis: posts.length };
}

export function hookScore(hook: string, l: Lifts, platform: PostPlatform): { score: number; features: FeatureKey[] } {
  const features = (Object.keys(FEATURES) as FeatureKey[]).filter((k) => FEATURES[k].test(hook));
  let score = 50 + features.reduce((n, k) => n + l.lifts[k], 0);
  if (platform === "x" && hook.length > 240) score -= 15;
  if (firstLine(hook).length > 160) score -= 8;
  return { score: clamp(score, 1, 99), features };
}

/* ── 1. Viral Twin Simulator ─────────────────────────────────────────────── */

export type TwinPrediction =
  | { status: "no_data"; message: string }
  | {
      status: "ok";
      percentile: number;
      range: [number, number];
      confidence: "high" | "medium" | "low";
      expectedLikes: number | null;
      own: Array<{ post: PostRow; sim: number; percentile: number }>;
      creators: Array<{ post: PostRow; sim: number; percentile: number }>;
      explanation: string[];
    };

export function viralTwin(args: { idea: string; hook: string; platform: PostPlatform; posts: PostRow[] }): TwinPrediction {
  const mine = args.posts.filter((p) => p.author === "me");
  const theirs = args.posts.filter((p) => p.author !== "me");
  if (!mine.length && !theirs.length) {
    return { status: "no_data", message: "Import your past posts (and a few viral posts from creators you admire) to get predictions based on your own audience." };
  }
  const pct = percentiles(args.posts);
  const lifts = learnLifts(mine.length >= 6 ? mine : args.posts, pct);
  const text = `${args.hook}\n${args.idea}`;
  const own = similarTo(text, mine).slice(0, 5).map((x) => ({ ...x, percentile: pct.get(x.post.id) ?? 50 }));
  const creators = similarTo(text, theirs).slice(0, 5).map((x) => ({ ...x, percentile: pct.get(x.post.id) ?? 50 }));
  const hook = hookScore(args.hook || args.idea, lifts, args.platform);
  const neighbours = [...own.map((x) => ({ p: x.percentile, w: x.sim * 2 })), ...creators.map((x) => ({ p: x.percentile, w: x.sim }))];
  const wsum = neighbours.reduce((n, x) => n + x.w, 0);
  const fromNeighbours = wsum ? neighbours.reduce((n, x) => n + x.p * x.w, 0) / wsum : null;
  const percentile = clamp(fromNeighbours == null ? hook.score : fromNeighbours * 0.6 + hook.score * 0.4, 1, 99);
  const ps = neighbours.map((x) => x.p).sort((a, b) => a - b);
  const range: [number, number] = ps.length >= 2 ? [clamp(Math.min(percentile, ps[Math.floor(ps.length * 0.25)]!)), clamp(Math.max(percentile, ps[Math.ceil(ps.length * 0.75) - 1]!))] : [clamp(percentile - 20), clamp(percentile + 20)];
  const strongOwn = own.filter((x) => x.sim >= 0.15).length;
  const confidence = mine.length >= 15 && strongOwn >= 3 ? "high" : own.length + creators.length >= 2 ? "medium" : "low";
  const likesSorted = mine.filter((p) => p.platform === args.platform).map((p) => p.likes).sort((a, b) => a - b);
  const expectedLikes = likesSorted.length >= 5 ? likesSorted[Math.min(likesSorted.length - 1, Math.floor((percentile / 100) * likesSorted.length))]! : null;
  const explanation: string[] = [];
  if (own.length) explanation.push(`${own.length} of your own posts cover similar ground; they landed around the ${Math.round(mean(own.map((x) => x.percentile)))}th percentile of your posts.`);
  else explanation.push("None of your own posts are close to this idea, so the estimate leans on similar creators and your hook patterns.");
  if (creators.length) explanation.push(`${creators.length} similar posts in your swipe file averaged the ${Math.round(mean(creators.map((x) => x.percentile)))}th percentile for their authors.`);
  if (hook.features.length) explanation.push(`Hook traits: ${hook.features.map((f) => FEATURES[f].label.toLowerCase()).join(", ")}.`);
  if (mine.length < 6) explanation.push(`Based on only ${mine.length} of your posts. Import more for a sharper prediction.`);
  return { status: "ok", percentile, range, confidence, expectedLikes, own, creators, explanation };
}

/* ── 2. Audience Reaction Panel (simulated) ───────────────────────────────── */

const UNIVERSAL = /\b(all|every|everyone|always|never|nobody|no one)\b/i;
const HEDGE = /\b(might|maybe|perhaps|could be|i think|i guess|sort of|kind of)\b/i;

export type Reaction = {
  persona: Persona;
  interest: number;
  verdict: "Leans in" | "Curious but skeptical" | "Scrolls past";
  objections: string[];
  questions: string[];
};

export function audiencePanel(args: { idea: string; hook: string; personas: Persona[]; evidenceText: string }): { reactions: Reaction[]; hookIssues: string[]; weakPoints: string[] } {
  const text = `${args.hook}\n${args.idea}`;
  const kw = keywords(text);
  const evidence = args.evidenceText.toLowerCase();
  const claims = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(" ").length >= 4);
  const unsupportedFigures = [...new Set(figures(text))].filter((f) => !figures(evidence).includes(f));
  const universals = claims.filter((c) => UNIVERSAL.test(c));
  const hasHow = /\b(how|step|first|then|start by|here'?s)\b/i.test(text);
  const jargon = (text.match(/\b[A-Z]{3,}\b|\b\w{14,}\b/g) ?? []).length;

  const hookIssues: string[] = [];
  const hookLine = firstLine(args.hook || args.idea);
  if (hookLine.split(/\s+/).length > 25) hookIssues.push(`The hook takes ${hookLine.split(/\s+/).length} words to make its point. Aim for under 15.`);
  if (!/\d|\?|\b(i|we)\b/i.test(hookLine) && !FEATURES.contrarian.test(hookLine)) hookIssues.push("The hook has no number, question, stance or first-hand detail, so nothing stops the scroll.");
  if (/^(in today|as a|it'?s no secret|we all know)/i.test(hookLine)) hookIssues.push("Opens with a throat-clearing phrase. Start with the claim.");

  const weakPoints: string[] = [];
  for (const c of claims.filter((s) => HEDGE.test(s)).slice(0, 2)) weakPoints.push(`Hedged claim: “${c.slice(0, 120)}”. Commit to it or cut it.`);
  for (const c of universals.slice(0, 2)) weakPoints.push(`Sweeping claim: “${c.slice(0, 120)}”. Say who it applies to.`);
  for (const f of unsupportedFigures.slice(0, 2)) weakPoints.push(`${f} has no source in your knowledge base yet.`);

  const reactions = args.personas.map((persona): Reaction => {
    const cares = keywords(`${persona.description} ${persona.cares}`);
    const avoid = keywords(persona.avoid);
    const hits = [...kw].filter((k) => cares.has(k)).length;
    const turnOffs = [...kw].filter((k) => avoid.has(k));
    let interest = 35 + Math.min(40, hits * 12) + (FEATURES.number.test(hookLine) ? 6 : 0) - turnOffs.length * 12 - (hookIssues.length ? 8 : 0) - Math.min(15, jargon * 3);
    interest = clamp(interest, 3, 97);
    const objections: string[] = [];
    for (const f of unsupportedFigures.slice(0, 1)) objections.push(`Where does ${f} come from? I'd want the source before I share this.`);
    for (const c of universals.slice(0, 1)) objections.push(`“${c.slice(0, 80)}${c.length > 80 ? "…" : ""}” Does that hold for someone like me?`);
    for (const t of turnOffs.slice(0, 1)) objections.push(`Talk of “${t}” is exactly what ${persona.name.toLowerCase()} tune out (${persona.avoid}).`);
    if (jargon >= 3) objections.push("Too much jargon; I'd need it in plain words.");
    const questions: string[] = [];
    if (!hasHow) questions.push("How would I actually do this? What's the first step?");
    if (/\b(cost|price|roi|budget|money|revenue|burn)\b/i.test(`${persona.cares}`) && !/\$|\bcost|\bprice|\broi\b/i.test(text)) questions.push("What does it cost, and what's the return?");
    if (/\b(risk|security|compliance|regulat)/i.test(persona.cares) && !/\brisk|secur|complian|regulat/i.test(text)) questions.push("What are the risks, and how do you handle them?");
    if (!questions.length) questions.push(`What changes for ${persona.name.toLowerCase()} specifically?`);
    const verdict = interest >= 65 ? "Leans in" : interest >= 40 ? "Curious but skeptical" : "Scrolls past";
    return { persona, interest, verdict, objections: objections.slice(0, 3), questions: questions.slice(0, 2) };
  });
  return { reactions, hookIssues, weakPoints };
}

/* ── 3. Historical Analog Finder ─────────────────────────────────────────── */

export type Analog = { post: PostRow; sim: number; percentile: number; per1k: number; basis: string; shared: string[]; traits: string[] };

export function analogs(text: string, posts: PostRow[]): { high: Analog[]; low: Analog[] } {
  const pct = percentiles(posts);
  const near = similarTo(text, posts).slice(0, 30).map((x): Analog => {
    const e = engagement(x.post);
    return {
      post: x.post,
      sim: x.sim,
      percentile: pct.get(x.post.id) ?? 50,
      per1k: Math.round(e.value * 10) / 10,
      basis: e.basis === "followers" ? "per 1k followers" : e.basis === "impressions" ? "per 1k impressions" : "raw interactions",
      shared: x.shared,
      traits: (Object.keys(FEATURES) as FeatureKey[]).filter((k) => FEATURES[k].test(x.post.text)).map((k) => FEATURES[k].label),
    };
  });
  return {
    high: near.filter((a) => a.percentile >= 65).slice(0, 3),
    low: near.filter((a) => a.percentile <= 35).slice(0, 3),
  };
}

/* ── 4. Hook Tournament ──────────────────────────────────────────────────── */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const trimEnd = (s: string) => s.trim().replace(/[.!?]+$/, "");

export function generateHooks(args: { title: string; notes: string; audience?: string | null }): string[] {
  const thesis = trimEnd(args.title);
  const lowerThesis = thesis.charAt(0).toLowerCase() + thesis.slice(1);
  const text = `${args.title}. ${args.notes}`;
  const figSentence = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[-*•]\s*/, "").trim()).find((s) => figures(s).length && s.split(" ").length <= 30);
  const topic = [...keywords(args.title)].slice(0, 3).join(" ") || "this";
  const who = args.audience ?? "founders";
  const story = args.notes.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[-*•]\s*/, "").trim()).find((s) => /\b(we|i)\b/i.test(s) && s.split(" ").length <= 28);
  const hooks = [
    figSentence ? `${trimEnd(figSentence)}.` : null,
    `Unpopular opinion: ${lowerThesis}.`,
    `What if ${lowerThesis}?`,
    story ? `${cap(trimEnd(story))}. Here's what we learned.` : null,
    `How we learned that ${lowerThesis}.`,
    `The mistake most ${who} make with ${topic}.`,
    `3 things I'd tell ${who} about ${topic}:`,
    figSentence ? `${figures(figSentence)[0]}. That's the number that changed how I think about ${topic}.` : null,
    `Stop treating ${topic} as an afterthought. ${cap(lowerThesis)}.`,
    `${cap(lowerThesis)}. Most people get this backwards.`,
  ];
  return [...new Set(hooks.filter((h): h is string => Boolean(h)).map((h) => h.replace(/\s+/g, " ")))].slice(0, 10);
}

export type Tournament = {
  ranked: Array<{ hook: string; score: number; features: FeatureKey[]; own: boolean }>;
  rounds: Array<Array<{ a: string; b: string | null; winner: string }>>;
  lifts: Lifts;
};

export function hookTournament(args: { hooks: string[]; ownHooks: string[]; posts: PostRow[]; platform: PostPlatform }): Tournament {
  const mine = args.posts.filter((p) => p.author === "me");
  const pct = percentiles(args.posts);
  const lifts = learnLifts(mine.length >= 6 ? mine : args.posts, pct);
  const entries = [...args.ownHooks.map((h) => ({ hook: h, own: true })), ...args.hooks.filter((h) => !args.ownHooks.includes(h)).map((h) => ({ hook: h, own: false }))]
    .slice(0, 12)
    .map((e) => ({ ...e, ...hookScore(e.hook, lifts, args.platform) }));
  const ranked = [...entries].sort((a, b) => b.score - a.score || a.hook.length - b.hook.length);
  const better = (a: (typeof entries)[number], b: (typeof entries)[number]) => (a.score > b.score || (a.score === b.score && a.hook.length <= b.hook.length) ? a : b);
  const rounds: Tournament["rounds"] = [];
  let field = [...entries];
  while (field.length > 1) {
    const round: Tournament["rounds"][number] = [];
    const next: typeof entries = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i]!;
      const b = field[i + 1];
      const w = b ? better(a, b) : a;
      round.push({ a: a.hook, b: b?.hook ?? null, winner: w.hook });
      next.push(w);
    }
    rounds.push(round);
    field = next;
  }
  return { ranked, rounds, lifts };
}

/* ── 5. Trend Timing Radar ──────────────────────────────────────────────── */

export type TrendSignal = { title: string; date: string | null; url?: string | null; source: string };

export type Radar = {
  status: "rising" | "steady" | "cooling" | "unknown";
  evidence: string[];
  signals: TrendSignal[];
  bestTime: { label: string; fromData: boolean };
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function trendRadar(args: { idea: string; posts: PostRow[]; signals: TrendSignal[]; platform: PostPlatform; now?: Date }): Radar {
  const now = args.now ?? new Date();
  const related = similarTo(args.idea, args.posts).filter((x) => x.sim >= 0.08 && x.post.postedAt).map((x) => x.post);
  const days = (d: Date) => (now.getTime() - d.getTime()) / 86_400_000;
  const recent = related.filter((p) => days(p.postedAt!) <= 14);
  const prior = related.filter((p) => days(p.postedAt!) > 14 && days(p.postedAt!) <= 28);
  const signalsRecent = args.signals.filter((s) => s.date && days(new Date(s.date)) <= 14).length;
  const signalsPrior = args.signals.filter((s) => s.date && days(new Date(s.date)) > 14 && days(new Date(s.date)) <= 28).length;
  const r = recent.length + signalsRecent;
  const p = prior.length + signalsPrior;
  const evidence: string[] = [];
  if (related.length) evidence.push(`${recent.length} related posts in your swipe file and history in the last 14 days, ${prior.length} in the 14 before.`);
  if (args.signals.length) evidence.push(`${signalsRecent} recent news and search results on this topic (${signalsPrior} in the prior two weeks).`);
  const pct = percentiles(args.posts);
  const recentPerf = mean(recent.map((x) => pct.get(x.id) ?? 50));
  if (recent.length >= 2) evidence.push(`Recent related posts average the ${Math.round(recentPerf)}th percentile for their authors.`);
  let status: Radar["status"] = "unknown";
  if (r + p >= 3) status = r >= p * 1.5 && r - p >= 2 ? "rising" : p >= r * 1.5 && p - r >= 2 ? "cooling" : "steady";
  if (status === "unknown") evidence.push("Not enough dated signals yet. Capture more posts on this topic, or connect Monid search for news.");

  const mine = args.posts.filter((x) => x.author === "me" && x.platform === args.platform && x.postedAt);
  let bestTime: Radar["bestTime"];
  if (mine.length >= 8) {
    const byDay = new Map<number, number[]>();
    for (const x of mine) byDay.set(x.postedAt!.getUTCDay(), [...(byDay.get(x.postedAt!.getUTCDay()) ?? []), pct.get(x.id) ?? 50]);
    const best = [...byDay.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => mean(b[1]) - mean(a[1]))[0];
    const hours = mine.filter((x) => best && x.postedAt!.getUTCDay() === best[0]).map((x) => x.postedAt!.getUTCHours());
    bestTime = best
      ? { label: `${DAYS[best[0]]}s around ${String(Math.round(mean(hours))).padStart(2, "0")}:00 UTC: your best day (avg ${Math.round(mean(best[1]))}th percentile across ${best[1].length} posts).`, fromData: true }
      : { label: defaultTime(args.platform), fromData: false };
  } else bestTime = { label: defaultTime(args.platform), fromData: false };
  return { status, evidence, signals: args.signals.slice(0, 6), bestTime };
}

function defaultTime(platform: PostPlatform): string {
  const general = platform === "linkedin" ? "Tuesday to Thursday mornings" : platform === "x" ? "weekday mornings" : platform === "instagram" ? "weekday evenings" : "early in the week";
  return `General guidance (not from your data): ${general}. Import 8+ of your posts with dates to learn your own best time.`;
}

/* ── 6. Controversy vs. Credibility ─────────────────────────────────────── */

export type ClaimCheck = {
  claim: string;
  surprise: number;
  support: "supported" | "your data" | "unsupported";
  evidence: string | null;
  quadrant: "Distinctive and supported" | "Distinctive but unsupported" | "Safe and supported" | "Safe and unsupported";
  advice: string;
};

export function controversyCredibility(args: { idea: string; evidence: Array<{ text: string; label: string; ownData: boolean }> }): { claims: ClaimCheck[]; distinctiveness: number; credibility: number } {
  const claims = args.idea
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•]\s*/, "").trim())
    .filter((s) => s.split(/\s+/).length >= 5)
    .slice(0, 8);
  const pool = args.evidence.flatMap((e) => e.text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.length > 20).map((s) => ({ s, kw: keywords(s), label: e.label, ownData: e.ownData })));
  const out = claims.map((claim): ClaimCheck => {
    let surprise = 15;
    if (FEATURES.contrarian.test(claim) || /\b(myth|overrated|underrated|backwards|the opposite)\b/i.test(claim)) surprise += 30;
    if (UNIVERSAL.test(claim)) surprise += 15;
    const figs = figures(claim);
    if (figs.some((f) => parseFloat(f) >= 50 || f.endsWith("x"))) surprise += 15;
    if (/\b(best|worst|only|biggest|first)\b/i.test(claim)) surprise += 10;
    if (/\b(not|isn'?t|aren'?t|doesn'?t|don'?t)\b/i.test(claim)) surprise += 10;
    surprise = clamp(surprise);
    const kw = keywords(claim);
    const match = pool
      .map((e) => ({ e, score: [...kw].filter((k) => e.kw.has(k)).length + (figs.some((f) => figures(e.s).includes(f)) ? 3 : 0) }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)[0];
    const support: ClaimCheck["support"] = !match ? "unsupported" : match.e.ownData ? "your data" : "supported";
    const distinctive = surprise >= 45;
    const backed = support !== "unsupported";
    const quadrant = distinctive ? (backed ? "Distinctive and supported" : "Distinctive but unsupported") : backed ? "Safe and supported" : "Safe and unsupported";
    const advice =
      quadrant === "Distinctive and supported"
        ? "Lead with this. It's surprising and you can back it."
        : quadrant === "Distinctive but unsupported"
          ? "Find a source, frame it as your experience, or soften it before publishing."
          : quadrant === "Safe and supported"
            ? "True but expected. Sharpen it: what would surprise your reader?"
            : "Neither surprising nor supported. Cut it or replace it with something you've seen first-hand.";
    return { claim, surprise, support, evidence: match ? `${match.e.label}: “${match.e.s.slice(0, 160)}”` : null, quadrant, advice };
  });
  return {
    claims: out,
    distinctiveness: out.length ? Math.round(mean(out.map((c) => c.surprise))) : 0,
    credibility: out.length ? Math.round((out.filter((c) => c.support !== "unsupported").length / out.length) * 100) : 0,
  };
}

/* ── Import ──────────────────────────────────────────────────────────────── */

/** Parse pasted CSV: header row with any of text, author, platform, url, date, likes, comments, shares, impressions, followers. */
export function parsePostsCsv(raw: string): Array<Omit<PostRow, "id">> {
  const rows = parseCsv(raw.trim());
  if (rows.length < 2) return [];
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = {
    text: col("text", "post", "content", "body"),
    author: col("author", "handle", "creator"),
    platform: col("platform", "network", "channel"),
    url: col("url", "link"),
    date: col("date", "posted_at", "postedat", "time", "created_at"),
    likes: col("likes", "reactions", "favorites"),
    comments: col("comments", "replies"),
    shares: col("shares", "reposts", "retweets"),
    impressions: col("impressions", "views"),
    followers: col("followers", "audience"),
  };
  if (ix.text < 0) return [];
  const num = (v: string | undefined) => {
    const n = Number(String(v ?? "").replace(/[, ]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  return rows.slice(1).flatMap((r) => {
    const text = (r[ix.text] ?? "").trim();
    if (!text) return [];
    const platform = normalizePlatform(ix.platform >= 0 ? r[ix.platform] : undefined);
    const date = ix.date >= 0 ? new Date(r[ix.date] ?? "") : null;
    return [
      {
        author: ix.author >= 0 && r[ix.author]?.trim() ? r[ix.author]!.trim() : "me",
        platform,
        url: ix.url >= 0 ? r[ix.url]?.trim() || null : null,
        text: text.slice(0, 5000),
        postedAt: date && !Number.isNaN(date.getTime()) ? date : null,
        likes: num(r[ix.likes]) ?? 0,
        comments: num(r[ix.comments]) ?? 0,
        shares: num(r[ix.shares]) ?? 0,
        impressions: ix.impressions >= 0 ? num(r[ix.impressions]) : null,
        followers: ix.followers >= 0 ? num(r[ix.followers]) : null,
      },
    ];
  });
}

export function normalizePlatform(raw: string | undefined | null): PostPlatform {
  const v = (raw ?? "").toLowerCase();
  if (/^(x|twitter)/.test(v) || /(x|twitter)\.com/.test(v)) return "x";
  if (v.includes("linkedin")) return "linkedin";
  if (v.includes("instagram")) return "instagram";
  if (v.includes("tiktok")) return "tiktok";
  if (v.includes("newsletter") || v.includes("substack")) return "newsletter";
  if (v.includes("blog")) return "blog";
  return v ? "other" : "linkedin";
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (q) {
      if (c === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}
