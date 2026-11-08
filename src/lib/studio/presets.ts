import type { AgentRole, Cadence, Persona } from "@/lib/db/schema";

/** Starting points a founder can keep, edit or delete. */

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "investors",
    name: "Investors",
    description: "seed and Series A investors evaluating the company",
    cares: "market size, traction, growth rate, revenue, defensibility, what the team has learned",
    avoid: "hype, vague vision statements, vanity metrics",
  },
  {
    id: "customers",
    name: "Customers",
    description: "operators at companies that could buy the product",
    cares: "saving time, cost, reliability, how to get started, results other teams saw",
    avoid: "jargon, fundraising news, internal process",
  },
  {
    id: "developers",
    name: "Developers",
    description: "engineers who would integrate or build on the product",
    cares: "how it works, APIs, performance, security, honest trade-offs, code examples",
    avoid: "marketing language, superlatives, claims without benchmarks",
  },
];

export const WORKFLOW_TEMPLATES: Array<{ name: string; kind: "format" | "agent"; agentTitle?: string; description: string; instructions: string; sections: string[]; personaId?: string; channels: string[]; cadence: Cadence }> = [
  {
    name: "Weekly founder update",
    kind: "agent",
    agentTitle: "Weekly columnist",
    description: "A short weekly note on what shipped, what you learned and what's next.",
    instructions: "Write a candid weekly update in the first person. One concrete win, one thing that didn't work and why, one number that moved, and what we're doing next week.",
    sections: ["What shipped", "What didn't work", "The number that moved", "Next week"],
    personaId: "customers",
    channels: ["linkedin", "newsletter"],
    cadence: "weekly",
  },
  {
    name: "Industry analysis",
    kind: "agent",
    agentTitle: "Industry analyst",
    description: "A monthly, source-backed take on a shift in your market.",
    instructions: "Pick one development in our market, explain what changed with evidence, who it affects, and what we think founders should do about it. Separate what the evidence shows from our opinion.",
    sections: ["What changed", "What the evidence shows", "Who it affects", "What we'd do"],
    personaId: "investors",
    channels: ["linkedin", "x"],
    cadence: "monthly",
  },
  {
    name: "Investor update",
    kind: "format",
    description: "Monthly investor update: highlights, metrics, asks.",
    instructions: "Lead with the headline number. Be specific about what went wrong as well as right. End with concrete asks.",
    sections: ["Highlights", "Metrics", "Lowlights", "Asks"],
    personaId: "investors",
    channels: ["newsletter"],
    cadence: "none",
  },
  {
    name: "Product launch post",
    kind: "format",
    description: "Announce a feature: the problem, what's new, how to try it.",
    instructions: "Start with the customer problem, then what's new, a concrete example, and how to try it today.",
    sections: ["The problem", "What's new", "How it works", "Try it"],
    personaId: "customers",
    channels: ["x", "linkedin", "newsletter"],
    cadence: "none",
  },
];

/** The built-in desk. Each role is a distinct step with its own output in the agent log. */
export const AGENT_TEAM: Array<{ role: AgentRole; name: string; does: string; checks: string }> = [
  { role: "researcher", name: "Researcher", does: "Plans the research, pulls in your knowledge base, searches and reads sources, keeps only verbatim passages.", checks: "Passages must appear word for word in a retrieved source." },
  { role: "writer", name: "Writer", does: "Drafts in your voice for the chosen persona and workflow, citing a source beside every claim.", checks: "Briefed with your voice profile, style guide, personas and editorial memory." },
  { role: "editor", name: "Editor", does: "Applies your style guide and remembered corrections to every field that will be published.", checks: "Preferred terms, banned phrases, tone and formatting rules." },
  { role: "fact_checker", name: "Fact-checker", does: "Holds every number, scope and citation to its source and protects private names.", checks: "Figures, universal claims, unknown citations, boundaries." },
  { role: "reviewer", name: "Reviewer", does: "Scores quality, decides revise / ask you / ready, and writes the approval email.", checks: "Accuracy, sources, originality, voice, readability, search." },
];

export const CUSTOM_AGENT_TITLES = ["Weekly columnist", "Industry analyst", "Newsletter editor", "Launch writer", "Investor relations"] as const;

/**
 * Built-in starter voices for founders with nothing written yet. Each is a
 * short sample in a recognisable style; adding one teaches the voice profile
 * that style until the founder's own writing replaces it.
 */
export const STARTER_VOICES: Array<{ id: string; name: string; blurb: string; sample: string }> = [
  {
    id: "plain",
    name: "Plain-spoken founder",
    blurb: "Short sentences, first person, no jargon.",
    sample:
      "We shipped a smaller version of the feature last week. It's not perfect. But customers are using it, and that tells us more than another month of planning would. Here's what I learned: ship the part people asked for, watch what they do, then decide. We'll share the numbers next week, good or bad.",
  },
  {
    id: "technical",
    name: "Technical builder",
    blurb: "Precise, explains how things work, honest trade-offs.",
    sample:
      "Our first architecture queued every request through a single worker, which kept the code simple but capped throughput at about forty jobs a minute. We moved to leased rows in Postgres with FOR UPDATE SKIP LOCKED, so any number of workers can claim work safely. The trade-off is more database load; at our scale that is cheaper than running a separate queue.",
  },
  {
    id: "story",
    name: "Storyteller",
    blurb: "Opens with a moment, builds to a lesson.",
    sample:
      "The call came at 11pm. Our biggest customer was about to churn, and I had no idea why. I drove to their office the next morning with a notebook and no slides. Two hours later I understood: we had built exactly what they asked for, and nothing they needed. That meeting changed our roadmap, and it changed how I listen.",
  },
  {
    id: "analyst",
    name: "Data-driven operator",
    blurb: "Leads with numbers, separates evidence from opinion.",
    sample:
      "Three numbers explain our quarter. Activation rose from 31% to 44% after we cut onboarding to four steps. Net revenue retention held at 112%. Support tickets per account fell by a third. My read, which is opinion rather than evidence: the onboarding change mattered most, because every downstream metric moved within two weeks of it.",
  },
];
