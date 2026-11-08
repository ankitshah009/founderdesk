import { describe, expect, it } from "vitest";
import { brandFromHtml, brandFromText, mergeBrand } from "@/lib/studio/brand";
import { addDays, cadenceDates, monthGrid, parseYmd } from "@/lib/studio/calendar";
import { decryptSecret, encryptSecret } from "@/lib/studio/crypto";
import { diffDocuments, diffStats } from "@/lib/studio/diff";
import { applySelectionEdit, localSelectionEdit, locateSelection, parseInstruction } from "@/lib/studio/edit";
import { analogs, audiencePanel, controversyCredibility, engagement, generateHooks, hookTournament, parsePostsCsv, trendRadar, viralTwin, type PostRow } from "@/lib/studio/ideas";
import { refreshCandidates } from "@/lib/studio/insights";
import { DEFAULT_PERSONAS } from "@/lib/studio/presets";
import { scoreDraft } from "@/lib/studio/quality";
import { applyStyleGuide, effectiveGuide, parseTermLines, styleGuideFindings } from "@/lib/studio/style";
import { analyzeVoice, voiceMatch } from "@/lib/studio/voice";
import { EXTENSION_FILES, FILL_SCRIPT, bookmarkletHref, zipFiles } from "@/lib/test-payment";

const CASUAL = [
  "We shipped the new onboarding last week. It's faster. I didn't expect support tickets to drop, but they did. Why? Because we cut three steps nobody needed. Our customers noticed within a day. We're doing the same to billing next.",
  "I've been asked how we hire. Honestly, we don't do take-home tests. We pair for an hour on a real bug. It's the best signal we've found. You'll learn more in sixty minutes than in a week of puzzles. We've hired six people this way.",
  "Here's the thing about pricing: we got it wrong twice. We're a small team, so we can't afford to guess. Now we talk to ten customers before any change. It's slower. It's also why churn fell. We'd do it again.",
];
const FORMAL =
  "The organisation implemented a comprehensive restructuring of its customer acquisition methodology during the fiscal period, resulting in measurable improvements across the principal performance indicators that management considers material to long-term enterprise valuation and stakeholder confidence.";

describe("brand voice", () => {
  it("learns a measurable fingerprint and scores drafts against it", () => {
    const v = analyzeVoice(CASUAL)!;
    expect(v.sampleCount).toBe(3);
    expect(v.avgSentenceLength).toBeLessThan(12);
    expect(v.contractionRate).toBeGreaterThan(1.5);
    expect(v.traits).toContain("Conversational: uses contractions");
    expect(v.traits).toContain("Writes in the first person");
    const close = voiceMatch(v, "We changed our trial last month. It's shorter now. I didn't think it'd matter, but signups rose. Why? We removed a step nobody used.");
    const far = voiceMatch(v, `${FORMAL} ${FORMAL}`);
    expect(close.score).toBeGreaterThan(far.score + 25);
    expect(far.notes.length).toBeGreaterThan(0);
  });

  it("refuses to guess from too little writing", () => {
    expect(analyzeVoice(["Too short to tell."])).toBeNull();
  });
});

describe("style guide and memory", () => {
  const guide = { preferredTerms: parseTermLines("teams = customers, clients\nAI agent = bot"), bannedPhrases: ["game-changer"], tone: "plain", formatting: [] };

  it("applies preferred terms everywhere but never inside citations or links", () => {
    const { draft, changes } = applyStyleGuide(
      { title: "Customers first", dek: "For clients", bodyMarkdown: "Our customers love the bot. [S1] See https://example.com/customers", announcement: "Customers: {{url}}", variants: { x: ["Clients win"] } },
      guide,
    );
    expect(draft.title).toBe("Teams first");
    expect(draft.bodyMarkdown).toBe("Our teams love the AI agent. [S1] See https://example.com/customers");
    expect(draft.announcement).toBe("Teams: {{url}}");
    expect(draft.variants?.x).toEqual(["Teams win"]);
    expect(changes.join(" ")).toContain("“customers” → “teams”");
  });

  it("turns remembered corrections into rules and flags banned phrases softly", () => {
    const eff = effectiveGuide(guide, [
      { text: "Use “pilot” instead of “trial”", active: true },
      { text: "Never say synergy", active: true },
      { text: "Use “x” instead of “y”", active: false },
    ]);
    expect(eff.preferredTerms.some((t) => t.use === "pilot" && t.insteadOf.includes("trial"))).toBe(true);
    expect(eff.bannedPhrases).toContain("synergy");
    expect(eff.preferredTerms.some((t) => t.use === "x")).toBe(false);
    const f = styleGuideFindings("This is a game-changer.\n\n## Sources\n- game-changer", eff, (k) => k);
    expect(f).toHaveLength(1);
    expect(f[0]!.id.startsWith("style-")).toBe(true);
  });
});

describe("highlight-and-ask editor", () => {
  it("parses instructions", () => {
    expect(parseInstruction("replace “customers” with “teams”")).toEqual({ kind: "replace", from: "customers", to: "teams" });
    expect(parseInstruction("use pilot instead of trial")).toEqual({ kind: "replace", from: "trial", to: "pilot" });
    expect(parseInstruction("Make this shorter")).toEqual({ kind: "shorten" });
    expect(parseInstruction("never say leverage")).toEqual({ kind: "avoid", phrase: "leverage" });
    expect(parseInstruction("make it sing")).toEqual({ kind: "unknown" });
  });

  it("finds rendered text in the markdown and keeps citations when shortening", () => {
    const md = "## The short version\n\nAcross the **42 B2B SaaS companies** in the pilot, response time improved by 60%. [S1] Teams that automated everything saw escalations rise. [S2]\n\n- A list item";
    const sel = "Across the 42 B2B SaaS companies in the pilot, response time improved by 60%. S1 Teams that automated everything saw escalations rise. S2";
    const range = locateSelection(md, sel)!;
    expect(range).not.toBeNull();
    expect(md.slice(range.start, range.end)).toContain("[S2]");
    const edit = localSelectionEdit(md.slice(range.start, range.end), "shorter");
    expect(edit.ok).toBe(true);
    const next = applySelectionEdit(md, range, edit.ok ? edit.replacement : "");
    expect(next).toContain("[S1]");
    expect(next).toContain("[S2]");
    expect(next).not.toContain("escalations rise");
  });

  it("says plainly when it can't do something", () => {
    const r = localSelectionEdit("Our pricing is simple.", "make it more poetic");
    expect(r.ok).toBe(false);
  });
});

describe("quality score", () => {
  it("rewards cited, readable, original drafts", () => {
    const sources = [
      { ref: "S1", kind: "search_result" as const, status: "fetched" as const, url: "https://a", content: "Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60%." },
      { ref: "S2", kind: "attachment" as const, status: "fetched" as const, url: null, content: "Escalation rates rose by 12% when every ticket type was automated at once." },
    ];
    const good = scoreDraft({
      draft: {
        title: "Why founders should start with narrow support workflows",
        dek: "What the evidence supports, where it stops, and what we learned first-hand while piloting support automation.",
        bodyMarkdown: "## Why start narrow?\n\nStart with one workflow you can measure. We did, and it paid off.\n\nIn the pilot, response time improved by 60%. [S1] Automating everything at once raised escalations by 12%. [S2]\n\n## What we'd do\n\nPick password resets first. Measure for a month. Then expand.\n\n## Sources\n\n- [S1] Pilot\n- [S2] Benchmark",
      },
      sources,
      findings: [],
      voice: null,
    });
    const bad = scoreDraft({ draft: { title: "Support", dek: "x", bodyMarkdown: "Everything is great. [S9]" }, sources, findings: [{ id: "f", severity: "blocking", kind: "figure_mismatch", claim: "x" }], voice: null });
    expect(good.voice).toBeNull();
    expect(good.overall).toBeGreaterThan(70);
    expect(good.overall).toBeGreaterThan(bad.overall + 25);
    expect(bad.suggestions.length).toBeGreaterThan(0);
  });
});

describe("version diff", () => {
  it("diffs paragraphs then words", () => {
    const a = "First paragraph.\n\nOur customers saw 80% faster replies.\n\nLast.";
    const b = "First paragraph.\n\nOur teams saw 60% faster replies.\n\nLast.";
    const d = diffDocuments(a, b);
    expect(d.map((p) => p.kind)).toEqual(["same", "changed", "same"]);
    expect(diffStats(a, b)).toEqual({ added: 2, removed: 2 });
  });
});

describe("calendar", () => {
  it("plans cadence slots on the chosen weekday", () => {
    const weekly = cadenceDates("weekly", parseYmd("2026-11-08"), 21);
    expect(weekly).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(cadenceDates("monthly", parseYmd("2026-11-08"), 70)).toEqual(["2026-12-01", "2027-01-05"]);
    expect(monthGrid(2026, 10)[0]![0]).toBe("2026-10-26");
    expect(addDays(parseYmd("2026-12-31"), 1).toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

const post = (id: string, author: string, text: string, likes: number, followers = 1000, daysAgo = 3, day?: number): PostRow => ({
  id,
  author,
  platform: "linkedin",
  text,
  postedAt: day == null ? new Date(Date.now() - daysAgo * 86_400_000) : new Date(Date.UTC(2026, 10, 1 + day, 9)),
  impressions: null,
  likes,
  comments: Math.round(likes / 10),
  shares: Math.round(likes / 20),
  followers,
});

const HISTORY: PostRow[] = [
  post("m1", "me", "We cut support response time 60% by starting with password resets.", 400),
  post("m2", "me", "3 lessons from automating support at a seed-stage startup.", 320),
  post("m3", "me", "Our offsite was great. Thanks team.", 20),
  post("m4", "me", "Hiring a founding engineer. DM me.", 35),
  post("m5", "me", "Why narrow AI support workflows beat automating everything.", 280),
  post("m6", "me", "Happy Friday everyone.", 10),
  post("m7", "me", "Escalations rose when we automated every ticket type at once.", 150),
  post("c1", "@bigcreator", "Stop automating every support ticket. Start with one workflow.", 9000, 100000),
  post("c2", "@bigcreator", "My morning routine.", 300, 100000),
];

describe("Idea Lab", () => {
  const idea = "Founders should start support automation with one narrow workflow, like password resets, before automating everything.";

  it("normalises engagement for account size", () => {
    expect(engagement(HISTORY[7]!).value).toBeLessThan(engagement(HISTORY[0]!).value * 0.3);
  });

  it("predicts from the founder's own similar posts", () => {
    const twin = viralTwin({ idea, hook: "We cut support response time 60% with one workflow.", platform: "linkedin", posts: HISTORY });
    expect(twin.status).toBe("ok");
    if (twin.status !== "ok") return;
    expect(twin.own.length).toBeGreaterThan(0);
    expect(twin.percentile).toBeGreaterThan(50);
    expect(viralTwin({ idea, hook: "", platform: "linkedin", posts: [] }).status).toBe("no_data");
  });

  it("finds high and low analogs", () => {
    const a = analogs(idea, HISTORY);
    expect(a.high.length).toBeGreaterThan(0);
    expect(a.high.every((x) => x.percentile >= 65)).toBe(true);
  });

  it("runs a hook tournament with a single winner", () => {
    const hooks = generateHooks({ title: "Start support automation with one narrow workflow", notes: "- We cut response time by 60% in six weeks.\n- Escalations rose when we automated everything." });
    expect(hooks.length).toBeGreaterThanOrEqual(5);
    const t = hookTournament({ hooks, ownHooks: ["My own hook about support"], posts: HISTORY, platform: "linkedin" });
    expect(t.ranked[0]!.score).toBeGreaterThanOrEqual(t.ranked[t.ranked.length - 1]!.score);
    expect(t.rounds[t.rounds.length - 1]).toHaveLength(1);
    expect(t.ranked.some((r) => r.own)).toBe(true);
  });

  it("simulates persona reactions with concrete objections", () => {
    const p = audiencePanel({ idea: `${idea} Every company saw 80% faster replies.`, hook: "Every company should do this", personas: DEFAULT_PERSONAS, evidenceText: "median first-response time improved by 60%" });
    expect(p.reactions).toHaveLength(3);
    expect(p.reactions[0]!.objections.join(" ")).toMatch(/80%/);
    expect(p.weakPoints.length).toBeGreaterThan(0);
  });

  it("separates distinctive claims from supported ones", () => {
    const c = controversyCredibility({
      idea: "Stop automating every support ticket at once. Median first-response time improved by 60% with narrow workflows. Support matters a lot for customers.",
      evidence: [{ text: "Across the pilot, median first-response time improved by 60% with narrow AI workflows.", label: "Pilot report", ownData: false }],
    });
    expect(c.claims.find((x) => x.claim.startsWith("Stop"))!.quadrant).toBe("Distinctive but unsupported");
    expect(c.claims.find((x) => x.claim.startsWith("Median"))!.support).toBe("supported");
  });

  it("reads trend direction from dated posts and says when it can't", () => {
    const rising = [0, 1, 2, 3, 4].map((d) => post(`r${d}`, "@x", "narrow support workflows automation pilot", 50, 1000, d));
    expect(trendRadar({ idea, posts: rising, signals: [], platform: "linkedin" }).status).toBe("rising");
    const r = trendRadar({ idea, posts: [], signals: [], platform: "linkedin" });
    expect(r.status).toBe("unknown");
    expect(r.bestTime.fromData).toBe(false);
  });

  it("imports posts from CSV", () => {
    const rows = parsePostsCsv('text,author,platform,likes,comments,followers,date\n"Hello, world",me,LinkedIn,10,2,500,2026-10-01\nSecond,@a,twitter,"1,200",30,90000,2026-10-02');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text).toBe("Hello, world");
    expect(rows[1]!.platform).toBe("x");
    expect(rows[1]!.likes).toBe(1200);
  });
});

describe("brand capture", () => {
  const html = `<html><head><title>Northwind | Support automation for SaaS teams</title>
  <meta name="description" content="Northwind routes repetitive tickets to narrow AI workflows. Built for early-stage SaaS teams.">
  <meta name="theme-color" content="#ff6b3d"><link rel="icon" href="/favicon.png">
  <style>.btn{background:#3b82f6;color:#ffffff}.x{color:#3b82f6}</style></head>
  <body><h1>Answer support tickets in minutes</h1><h2>Password reset workflows</h2><p>Resolve resets automatically with audit trails and handoff to humans.</p><h2>Refund triage</h2><p>Route refund requests by policy and amount.</p><footer>© Northwind</footer></body></html>`;

  it("reads name, tagline, colours, logo, audience and products from a website", () => {
    const c = brandFromHtml(html, "https://northwind.dev");
    expect(c.brand.name).toBe("Northwind");
    expect(c.brand.tagline).toBe("Answer support tickets in minutes");
    expect(c.brand.colors).toEqual(["#ff6b3d", "#3b82f6"]);
    expect(c.brand.logoUrl).toBe("https://northwind.dev/favicon.png");
    expect(c.brand.audience).toMatch(/SaaS teams/i);
    expect(c.brand.products).toEqual(["Password reset workflows", "Refund triage"]);
    expect(c.knowledge.some((k) => k.kind === "company" && k.pinned)).toBe(true);
  });

  it("reads pasted text and merges inputs", () => {
    const t = brandFromText("Northwind\nNorthwind helps support teams answer faster. We built it for SaaS teams. Northwind is used by 40 companies.\n- Password resets\n- Refund triage", "pasted text");
    expect(t.brand.name).toBe("Northwind");
    expect(t.brand.products).toEqual(["Password resets", "Refund triage"]);
    const merged = mergeBrand(null, t.brand, "pasted text");
    const again = mergeBrand(merged, brandFromHtml(html, "https://northwind.dev").brand, "https://northwind.dev");
    expect(again.name).toBe("Northwind");
    expect(again.colors).toContain("#ff6b3d");
    expect(again.sources).toEqual(["pasted text", "https://northwind.dev"]);
  });
});

describe("insights", () => {
  it("flags aged articles for refresh", () => {
    const now = new Date("2026-11-08T00:00:00Z");
    const c = refreshCandidates(
      [
        { jobId: "a", title: "Old", topic: "x", slug: null, url: null, publishedAt: new Date("2026-03-01"), views: 0, reads: 0, body: "In 2023, 40% of teams…", sourceDates: ["2022-01-01"] },
        { jobId: "b", title: "Fresh", topic: "y", slug: null, url: null, publishedAt: new Date("2026-11-01"), views: 0, reads: 0, body: "Today.", sourceDates: [] },
      ],
      now,
    );
    expect(c.map((x) => x.jobId)).toEqual(["a"]);
    expect(c[0]!.urgency).toBe("high");
  });
});

describe("secrets and test payments", () => {
  it("encrypts tokens at rest", () => {
    const sealed = encryptSecret("tok_123");
    expect(sealed).not.toContain("tok_123");
    expect(decryptSecret(sealed)).toBe("tok_123");
    expect(decryptSecret(`${sealed}x`)).toBeNull();
  });

  it("builds a valid extension zip and a test-mode-only fill script", () => {
    const zip = zipFiles(EXTENSION_FILES, "ext");
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(Object.keys(EXTENSION_FILES).length);
    expect(JSON.parse(EXTENSION_FILES["manifest.json"]!).content_scripts[0].matches).toEqual(["https://checkout.stripe.com/*"]);
    expect(FILL_SCRIPT).toContain("cs_test_");
    expect(bookmarkletHref().startsWith("javascript:")).toBe(true);
    // The script parses as JavaScript.
    expect(() => new Function(FILL_SCRIPT)).not.toThrow();
  });
});
