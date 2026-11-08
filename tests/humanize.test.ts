import { describe, expect, it } from "vitest";
import { decideOutcome } from "@/lib/workflow/editorial";
import { isSoftFinding, styleFindings, styleReport } from "@/lib/workflow/humanize";

const SLOP = `## Why it matters

In today's fast-paced world, founders must delve into support data. It's not just a tool, it's a mindset. This seamless approach is a game-changer for teams.

It's not only about speed — it's about trust — and it's about care. We unlock the full potential of every ticket and every reply.

In conclusion, the key is speed, quality, and trust.

## Sources

- [S1] Report`;

const HUMAN = `## What changed when we triaged with a model?

Ticket backlog fell from 410 to 120 in six weeks [S1]. That surprised us. We expected the model to help with routing, and it did, but the bigger change was that agents stopped reading every ticket twice before deciding who owned it.

Two things broke. Refund requests got tagged as billing questions, so they sat in the wrong queue for a day. And our weekend shift ignored the suggested labels entirely, because nobody had told them the labels existed.

We fixed the first with three example tickets in the prompt. The second took a five-minute Slack message.

What would you check first in your own queue?

## Sources

- [S1] Pilot report`;

let n = 0;
const fid = (k: string) => `${k}-${n++}`;

describe("humanizer", () => {
  it("flags stock phrases, not-X-but-Y, stacked dashes and summary endings", () => {
    const kinds = styleReport(SLOP).issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["stock_phrases", "not_x_but_y", "summary_ending"]));
  });

  it("leaves specific, varied prose alone and ignores the Sources list", () => {
    expect(styleReport(HUMAN).issues).toEqual([]);
  });

  it("measures uniform sentence rhythm", () => {
    const flat = Array.from({ length: 10 }, (_, i) => `Our team reviewed ticket batch number ${i} today.`).join(" ");
    expect(styleReport(flat).issues.map((i) => i.kind)).toContain("flat_rhythm");
  });

  it("sends style issues back for revision but never stops the order", () => {
    const findings = styleFindings(SLOP, fid);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(isSoftFinding)).toBe(true);
    const job = { founderReplies: [], openQuestions: [] } as never;
    expect(decideOutcome({ agentOutcome: "READY_FOR_APPROVAL", findings, job, revisionCycles: 0, maxRevisionCycles: 2 }).outcome).toBe("NEEDS_REVISION");
    expect(decideOutcome({ agentOutcome: "READY_FOR_APPROVAL", findings, job, revisionCycles: 2, maxRevisionCycles: 2 }).outcome).toBe("READY_FOR_APPROVAL");
  });
});

import { variantDepthFindings } from "@/lib/workflow/humanize";

describe("platform depth checks", () => {
  // The real posts that read as thin on order 1F0DDDD2.
  const thin = {
    xSingle: "Features, launch timing and better products all get copied. Test for moats that compound with use before you bet on one. {{url}}",
    x: [
      "Features, launch timing and better products all get copied. The edges worth testing are the ones that compound with use.",
      "Roger Martin's first test: does the customer get a real benefit, and what stops a rival from matching it?",
      "Fab spent $40M on marketing and lost $90M in 2012. Compare acquisition cohorts before you call it a moat.",
      "Data moats: one AI-vendor guide defines it as exclusive data. Test that claim before you bank on it. {{url}}",
    ],
    instagram: { slides: ["Features get copied.", "So how do you find a moat that lasts?", "Start with one question.", "Then ask what makes it harder to copy.", "Fab spent $40M.", "Compare cohorts.", "Full article: link in bio"], caption: "Most moat advice hands you a list. I would start with a test.\nFull article: link in bio.\n#StartupStrategy #Fab" },
  };
  const n = { i: 0 };
  const fid = (k: string) => `${k}-${n.i++}`;

  it("flags the thin thread, vague single post, short carousel and hedging", () => {
    const kinds = variantDepthFindings(thin, fid).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["depth_thin_x_thread", "depth_vague_x_post", "depth_thin_carousel", "depth_hedging"]));
  });

  it("checks platform mechanics: early links on X, LinkedIn fold and link position, IG caption link", () => {
    const kinds = variantDepthFindings(
      {
        x: ["Hook with link {{url}}", "a", "b", "c", "d", "e {{url}}"],
        linkedin: `${"A long opening line that keeps going well past the fold. ".repeat(5)}\nSecond line {{url}}\n${"Body text. ".repeat(150)}`,
        instagram: { slides: Array.from({ length: 8 }, () => "One concrete point per slide with enough words here"), caption: "Read it here {{url}}" },
      },
      fid,
    ).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["depth_x_early_link", "depth_linkedin_fold", "depth_linkedin_early_link", "depth_ig_caption_link"]));
  });

  it("passes a platform-native set and never blocks publication", () => {
    const good = {
      xSingle: "Fab's ad-bought shoppers bought again less often than its first 10k users. Before calling growth a moat, compare repeat rate by cohort. {{url}}",
      x: ["Fab raised $330M and sold for about $30M.", "Why: shoppers bought with ads came back less.", "Mechanism: discounts attract deal-seekers.", "Test 1: repeat-purchase rate by cohort.", "Test 2: referral share by cohort.", "How to apply: pull cohorts by channel, compare 90-day repeat rate, cut channels below your organic cohort.", "Takeaway: a moat shows up in cohorts first. {{url}}"],
      linkedin: `Fab raised $330M and sold for about $30M.\nIts paid cohorts were the tell.\n\n${"We saw the same pattern in our own data and changed how we measure. ".repeat(20)}\n\n1. Compare repeat rate by cohort.\n2. Track referral share.\n3. Cut channels below organic.\n\nWhich cohort metric do you trust most?\n\n{{url}}\n\n#StartupStrategy #Growth #SaaS`,
      instagram: { slides: Array.from({ length: 9 }, (_, i) => `Point ${i + 1}: one concrete step with a number like 90 days in it`), caption: "Fab raised $330M and sold for $30M. Here's the cohort test.\nSave this before your next board meeting.\n#StartupStrategy #Growth #SaaS" },
    };
    const f = variantDepthFindings(good, fid);
    expect(f).toEqual([]);
    expect(variantDepthFindings(thin, fid).every((x) => x.id.startsWith("style-"))).toBe(true);
  });
});
