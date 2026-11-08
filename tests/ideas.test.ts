import { describe, expect, it } from "vitest";
import { briefFromIdea, clearArgument, ideasSchema, normalizeUrl, readMaterial } from "@/lib/ideas";
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
    const brief = briefFromIdea({ material: "posthog.com\nWe see teams track 400 events and read 5 of them.", company: parsed.company, idea: parsed.ideas[0]!, angle: "We cut our own tracking plan from 400 events to 60." });
    expect(brief.body).toContain("My notes:\nWe see teams track 400 events and read 5 of them.");
    expect(brief.subject).toBe(parsed.ideas[0]!.title);
    expect(brief.body).not.toMatch(/\.\./);
    const b = parseBrief({ subject: brief.subject, body: brief.body });
    expect(b.audience?.toLowerCase()).toContain("heads of product");
    expect(b.sourceUrls).toContain("https://posthog.com");
    expect(b.thesis?.toLowerCase()).toContain("tracking every event");
    expect(brief.body).toContain("400 events to 60");
  });

  it("reads any mix: bare domain, links and notes", () => {
    expect(readMaterial("acme.com")).toEqual({ website: "https://acme.com", urls: ["https://acme.com"], notes: "" });
    const m = readMaterial("We keep seeing teams buy tools first. https://acme.com/blog/x and see https://hbr.org/y");
    expect(m.website).toBe("https://acme.com/blog/x");
    expect(m.urls).toHaveLength(2);
    expect(m.notes).toBe("We keep seeing teams buy tools first. and see");
    expect(readMaterial("email me at dana@acme.com about churn").website).toBeNull();
  });

  it("confirms a clear argument instead of suggesting, but not for a bare site or vague notes", () => {
    const direct = clearArgument("I want to argue that founders should do support themselves until $1M ARR. My audience is first-time B2B SaaS founders. We cut churn from 6% to 3%.");
    expect(direct?.thesis).toMatch(/^Founders should do support themselves/);
    expect(direct?.audience).toMatch(/first-time B2B SaaS founders/);
    expect(clearArgument("acme.com")).toBeNull();
    expect(clearArgument("We build analytics. Not sure what to write about yet, something about AI maybe. acme.com")).toBeNull();
  });

  it("keeps the founder's whole material in the brief when they argue it themselves", () => {
    const b = briefFromIdea({ material: "acme.com", idea: { title: "Do support yourself", argument: "Founders should run support until $1M ARR.", audience: "first-time founders" } });
    expect(b.body).toContain("Our website: https://acme.com");
    expect(b.body).not.toContain("About us");
  });
});
