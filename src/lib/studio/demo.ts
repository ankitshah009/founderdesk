import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs, socialPosts, workflows } from "@/lib/db/schema";
import { claimFree, createJob } from "@/lib/workflow/intake";
import { brandFromHtml, mergeBrand } from "./brand";
import { WORKFLOW_TEMPLATES } from "./presets";
import { addKnowledge, getProfile, remember, updateProfile } from "./store";

/**
 * The demo workspace: a fictional founder (Dana at Northwind) with a captured
 * brand, writing samples, a style guide, knowledge, post history and a real
 * article run through the actual pipeline. Everything is labelled as a demo.
 */

const SITE = `<html><head><title>Northwind | Support automation for SaaS teams</title>
<meta name="description" content="Northwind routes repetitive support tickets to narrow AI workflows, so small teams answer faster without losing the human touch. Built for early-stage SaaS teams.">
<meta name="theme-color" content="#ff6b3d"></head><body>
<h1>Answer support tickets in minutes, not hours</h1>
<h2>Password reset workflows</h2><p>Resolve resets automatically, with an audit trail and a clean handoff to a person when something looks off.</p>
<h2>Refund triage</h2><p>Route refund requests by policy and amount, and draft the reply for a human to send.</p>
<h2>Escalation guardrails</h2><p>Northwind watches escalation rates and pauses any workflow that starts making customers angrier.</p>
</body></html>`;

const SAMPLES = [
  "We shipped the new onboarding last week. It's faster. I didn't expect support tickets to drop, but they did. Why? Because we cut three steps nobody needed. Our customers noticed within a day. We're doing the same to billing next, and I'll share what happens.",
  "I've been asked how we hire. Honestly, we don't do take-home tests. We pair for an hour on a real bug. It's the best signal we've found. You'll learn more in sixty minutes than in a week of puzzles. We've hired six people this way and I'd do it again.",
  "Here's the thing about pricing: we got it wrong twice. We're a small team, so we can't afford to guess. Now we talk to ten customers before any change. It's slower. It's also why churn fell. If you're early, talk to customers before you touch the price page.",
];

const NOTES = `Hi team,

I want to write about why founders should start with narrow support workflows. My audience is early-stage SaaS founders. Please keep the customer names private.

Notes:
- We piloted with Acme Robotics and saw first-response time improved by 80% in six weeks.
- Narrow AI support workflows work for all companies, according to the pilot report.
- Starting with password resets and refunds kept escalation rates low for our team.

Thanks,
Dana`;

const PILOT = `Pilot report: AI-assisted support triage.
Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60% after routing password resets and refund requests to narrow AI workflows.
Companies that automated every ticket type at once saw escalation rates rise by 12% during the same period.
The pilot was limited to companies with fewer than 200 employees, so results may not generalize to larger support organizations.
Narrow AI support workflows reduced first-response time for the companies in the pilot without increasing escalations.`;

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

const POSTS: Array<{ author: string; text: string; likes: number; comments: number; shares: number; followers: number; ago: number; platform?: "x" | "linkedin" }> = [
  { author: "me", text: "We cut support response time 60% by starting with password resets. Not everything. One workflow.", likes: 412, comments: 58, shares: 31, followers: 4200, ago: 5 },
  { author: "me", text: "3 lessons from automating support at a seed-stage startup:\n1. Start narrow\n2. Measure escalations\n3. Keep a human on refunds", likes: 336, comments: 44, shares: 22, followers: 4150, ago: 12 },
  { author: "me", text: "Our offsite was great. Thanks team.", likes: 41, comments: 6, shares: 0, followers: 4100, ago: 19 },
  { author: "me", text: "Hiring a founding engineer in Lisbon. DM me.", likes: 58, comments: 9, shares: 4, followers: 4080, ago: 26 },
  { author: "me", text: "Why narrow AI support workflows beat automating everything at once.", likes: 290, comments: 37, shares: 18, followers: 4000, ago: 33 },
  { author: "me", text: "Happy Friday everyone.", likes: 22, comments: 2, shares: 0, followers: 3950, ago: 40 },
  { author: "me", text: "Escalations rose 12% when a friend automated every ticket type at once. Here's what they changed.", likes: 205, comments: 31, shares: 12, followers: 3900, ago: 47 },
  { author: "me", text: "We talked to ten customers before changing our price. Churn fell. Talk to customers first.", likes: 188, comments: 25, shares: 9, followers: 3850, ago: 54 },
  { author: "me", text: "Product update: refund triage is live for everyone.", likes: 64, comments: 7, shares: 3, followers: 3800, ago: 61 },
  { author: "me", text: "Unpopular opinion: most support automation fails because it starts too big.", likes: 377, comments: 72, shares: 26, followers: 3750, ago: 68 },
  { author: "@supportleadsweekly", text: "Stop automating every support ticket. Start with one workflow you can measure.", likes: 8800, comments: 640, shares: 410, followers: 120000, ago: 3, platform: "linkedin" },
  { author: "@supportleadsweekly", text: "My morning routine as a support leader.", likes: 900, comments: 40, shares: 5, followers: 120000, ago: 9 },
  { author: "@saasfounderdaily", text: "The mistake most founders make with AI support: automating refunds first.", likes: 2100, comments: 300, shares: 120, followers: 45000, ago: 6, platform: "x" },
  { author: "@saasfounderdaily", text: "Customer support is a growth channel. Here's the data from 40 companies.", likes: 1800, comments: 150, shares: 95, followers: 45000, ago: 15, platform: "x" },
  { author: "@opsnotes", text: "AI support pilots: what 42 SaaS companies learned about response time.", likes: 640, comments: 80, shares: 44, followers: 9000, ago: 2 },
  { author: "@opsnotes", text: "Weekend reading list.", likes: 70, comments: 3, shares: 2, followers: 9000, ago: 20 },
];

export async function seedDemo(email: string): Promise<{ jobId: string | null }> {
  const profile = await getProfile(email);
  const db = await getDb();
  if (profile.onboardedAt) {
    const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.founderEmail, email)).limit(1);
    return { jobId: job?.id ?? null };
  }
  const capture = brandFromHtml(SITE, "https://northwind.example");
  await updateProfile(email, {
    displayName: "Dana Reyes (demo)",
    company: "Northwind",
    brand: mergeBrand(null, capture.brand, "https://northwind.example (demo site)"),
    styleGuide: {
      tone: "Plain, specific, first person. Talk to a peer, not an audience.",
      preferredTerms: [{ use: "teams", insteadOf: ["clients"] }, { use: "AI workflows", insteadOf: ["bots"] }],
      bannedPhrases: ["game-changer", "synergy", "revolutionize"],
      formatting: ["Short paragraphs (three sentences at most).", "Sentence-case headings."],
    },
    onboardedAt: new Date(),
  });
  await addKnowledge(email, [
    ...capture.knowledge,
    { kind: "opinion", title: "Support automation should earn trust one workflow at a time", content: "I believe support automation fails when it starts too big. Earn trust with one measurable workflow, then expand. Customers forgive a slow human more than a confident wrong bot." },
    { kind: "opinion", title: "Founders should answer support tickets themselves for the first year", content: "Every founder should answer support for their first year. It's the fastest way to learn what to build and what to stop building." },
    { kind: "source", title: "Pilot report: AI-assisted support triage", content: PILOT, pinned: false },
    ...SAMPLES.map((content, i) => ({ kind: "sample" as const, title: ["Onboarding update (blog)", "How we hire (newsletter)", "Pricing lessons (LinkedIn)"][i]!, content })),
  ]);
  await remember(email, { kind: "preference", text: "Use “pilot” instead of “trial”", origin: "manual" });
  await db.insert(socialPosts).values(
    POSTS.map((p) => ({
      ownerEmail: email,
      author: p.author,
      platform: p.platform ?? "linkedin",
      text: p.text,
      postedAt: days(p.ago),
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      followers: p.followers,
      capturedVia: "manual" as const,
    })),
  );
  await db.insert(workflows).values(
    WORKFLOW_TEMPLATES.slice(0, 2).map((t) => ({ ownerEmail: email, name: t.name, kind: t.kind, agentTitle: t.agentTitle ?? null, description: t.description, instructions: t.instructions, sections: t.sections, personaId: t.personaId ?? null, channels: t.channels, cadence: t.cadence })),
  );
  const job = await createJob({
    channel: "web",
    founderEmail: email,
    founderName: "Dana Reyes",
    subject: "Article on AI customer support",
    body: NOTES,
    attachments: [{ filename: "pilot-report.txt", contentType: "text/plain", inlineText: PILOT }],
  });
  await claimFree(job.id);
  return { jobId: job.id };
}
