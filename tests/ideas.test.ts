import { describe, expect, it } from "vitest";
import { briefFromIdea, ideasSchema, normalizeUrl } from "@/lib/ideas";
import { parseBrief } from "@/lib/brief";

const sample = {
  company: { name: "PostHog", oneLiner: "Product analytics, session replay and flags in one place.", audience: "product engineers", voice: "Direct, nerdy, funny." },
  ideas: [
    { title: "Over-collecting events increases noise, not insight", argument: "Tracking every event dilutes the metrics that matter; map events to business outcomes first.", audience: "heads of product at seed-stage SaaS", why: "They see thousands of tracking plans." },
    { title: "B".repeat(140), argument: "A".repeat(400) + " end", audience: "founders", why: "Because they do." },
    { title: "Your editor becomes the control plane for product decisions", argument: "Agents will act on product data inside the editor, so centralise analytics, logs and experiments now.", audience: "product engineers", why: "Timely as coding agents spread." },
  ],
};

describe("website ideas", () => {
  it("normalises bare domains", () => {
    expect(normalizeUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeUrl(" http://acme.com/x ")).toBe("http://acme.com/x");
  });

  it("trims over-long model output instead of failing", () => {
    const parsed = ideasSchema.parse(sample);
    expect(parsed.ideas[1]!.title.length).toBeLessThanOrEqual(100);
    expect(parsed.ideas[1]!.argument.length).toBeLessThanOrEqual(320);
    expect(parsed.ideas[1]!.argument.endsWith("…")).toBe(true);
  });

  it("builds a brief the pipeline parses into thesis, audience and the website link", () => {
    const parsed = ideasSchema.parse(sample);
    const brief = briefFromIdea({ url: "posthog.com", company: parsed.company, idea: parsed.ideas[0]!, angle: "We cut our own tracking plan from 400 events to 60." });
    expect(brief.subject).toBe(parsed.ideas[0]!.title);
    expect(brief.body).not.toMatch(/\.\./);
    const b = parseBrief({ subject: brief.subject, body: brief.body });
    expect(b.audience?.toLowerCase()).toContain("heads of product");
    expect(b.sourceUrls).toContain("https://posthog.com");
    expect(b.thesis?.toLowerCase()).toContain("tracking every event");
    expect(brief.body).toContain("400 events to 60");
  });
});
