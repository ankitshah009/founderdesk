import type { Persona, Profile } from "@/lib/db/schema";
import { DEFAULT_PERSONAS } from "./presets";

/**
 * The five setup steps, shared by the Overview checklist, the progress strip
 * on each setup page and the guided tour, so they always agree.
 */

export type SetupStep = { key: "brand" | "voice" | "style" | "personas" | "article"; label: string; hint: string; href: string; tourTarget: string; done: boolean };

const stylePresent = (p: Profile) => {
  const g = p.styleGuide;
  return Boolean(g && (g.tone || g.preferredTerms.length || g.bannedPhrases.length || g.formatting.length));
};

// Compare field by field: jsonb doesn't keep key order, so JSON.stringify can't be trusted here.
const personaKey = (x: Persona) => [x.id, x.name, x.description, x.cares, x.avoid].join("\u0000");
export const personasCustomised = (p: Profile) => p.personas.map(personaKey).join("\u0001") !== DEFAULT_PERSONAS.map(personaKey).join("\u0001");

export function setupSteps(p: Profile, counts: { samples: number; jobs: number }): SetupStep[] {
  return [
    { key: "brand", label: "Capture your brand", hint: "Website, deck or a paragraph about the company", href: "/studio/onboarding", tourTarget: "/studio/onboarding", done: Boolean(p.brand?.name || p.brand?.description) },
    { key: "voice", label: "Add a writing sample", hint: "So drafts sound like you", href: "/studio/brand#voice", tourTarget: "/studio/brand", done: counts.samples > 0 },
    { key: "style", label: "Set your style guide", hint: "Tone, preferred terms, banned phrases", href: "/studio/brand#style", tourTarget: "/studio/brand", done: stylePresent(p) },
    { key: "personas", label: "Describe your readers", hint: "Personas the writer can aim at", href: "/studio/brand#personas", tourTarget: "/studio/brand", done: Boolean(p.setup?.personasConfirmed) || personasCustomised(p) },
    { key: "article", label: "Start your first article", hint: "Your first one is free", href: "/start", tourTarget: "/studio", done: counts.jobs > 0 },
  ];
}

export const nextStep = (steps: SetupStep[]) => steps.find((s) => !s.done) ?? null;

/** Copy for the Studio tutorial, one card per setup step. */
export const TOUR_COPY: Record<string, { title: string; body: string; cta: string }> = {
  brand: { title: "Capture your brand", body: "Paste your website, upload a deck or write a paragraph. We pull out what you sell, who it's for and the words you use.", cta: "Capture it" },
  voice: { title: "Teach it your voice", body: "Add something you wrote, or start from a built-in voice. The Writer matches your sentence length, contractions and phrases.", cta: "Add a sample" },
  style: { title: "Set your style guide", body: "Tone, words you prefer and phrases you never want to see. The Editor enforces them on every draft.", cta: "Set the guide" },
  personas: { title: "Pick your readers", body: "Investors, customers, developers: each article is aimed at one of them. Keep the defaults or make them yours.", cta: "Review personas" },
  article: { title: "Start your first article", body: "Drop in rough notes. Researcher, Writer, Editor, Fact-checker and Reviewer take it from there. Your first one is free.", cta: "Start writing" },
};
