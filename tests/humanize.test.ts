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
