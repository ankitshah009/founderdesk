/*
 * OWNER: replace these before launch.
 *
 * FounderDesk has no published customer quotes yet, so every entry below is a
 * placeholder marked `sample: true`. The page shows a visible "Sample quote"
 * tag on any sample entry. Swap in real quotes (with permission), set
 * `sample: false`, and use the person's real name, role and company.
 */

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  stage: string;
  sample: boolean;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: "I send rough notes on Sunday night and approve the draft on Monday. It reads like me on a good day.",
    name: "Placeholder",
    role: "Technical founder",
    company: "Devtools company",
    stage: "Seed",
    sample: true,
  },
  {
    quote: "It asked me one question, about a number I had wrong. I would rather get that email than see the mistake in public.",
    name: "Placeholder",
    role: "Solo founder",
    company: "B2B SaaS company",
    stage: "Pre-seed",
    sample: true,
  },
  {
    quote: "Our compliance lead reads the source list first now. Every figure has the passage it came from right next to it.",
    name: "Placeholder",
    role: "CEO",
    company: "Fintech company",
    stage: "Series A",
    sample: true,
  },
  {
    quote: "English is my second language. The drafts keep what I meant, and I fix the rest by highlighting a line and asking.",
    name: "Placeholder",
    role: "Founder",
    company: "Healthtech company",
    stage: "Seed",
    sample: true,
  },
  {
    quote: "I like that changing one word means approving again. Nothing goes out that I have not read.",
    name: "Placeholder",
    role: "Co-founder",
    company: "Climate company",
    stage: "Pre-seed",
    sample: true,
  },
  {
    quote: "The weekly update agent has a draft waiting on Monday morning. I edit it instead of starting from a blank page.",
    name: "Placeholder",
    role: "CEO",
    company: "Consumer app",
    stage: "Growth",
    sample: true,
  },
];
