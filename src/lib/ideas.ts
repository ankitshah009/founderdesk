import { z } from "zod";
import { env } from "@/lib/env";
import { fetchPage } from "@/lib/extract";
import { ProviderError } from "@/lib/integrations/http";
import { parseBrief } from "@/lib/brief";

/**
 * Lower-friction start: the founder pastes anything (website, notes, links,
 * a voice-note transcript). Clear arguments are confirmed as-is; otherwise one
 * fast model call suggests arguments grounded in their notes first. The full
 * research pipeline runs later on what they pick.
 */

/** Models overrun length hints; trim at a word boundary instead of failing. */
const clip = (max: number) =>
  z.string().min(1).transform((v) => {
    const t = v.trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:–—-]+$/, "")}…`;
  });

export const ideasSchema = z.object({
  company: z.object({
    name: clip(80),
    oneLiner: clip(200),
    audience: clip(120),
    voice: clip(160),
  }),
  ideas: z
    .array(
      z.object({
        title: clip(100),
        argument: clip(320),
        audience: clip(120),
        why: clip(180),
      }),
    )
    .min(3)
    .max(5),
});
export type Ideas = z.infer<typeof ideasSchema>;

const SYSTEM = [
  "You are a sharp editor who helps startup founders find articles worth writing.",
  "You get the founder's own notes and/or their company website. The notes come first: ground every idea in what the founder actually said (their claims, numbers, stories, opinions) and use the website only for context about what they sell and to whom.",
  "Suggest 4 arguments the founder can credibly make. Each must be: a claim a smart reader could disagree with; about the reader's problem or market, never about the company or its product; specific (a mechanism, a number to measure, a named practice); useful enough that buyers would forward it.",
  "Never mention the company or its product in `title` or `argument`. No 'why X tools are essential', no listicles, no 'the future of'.",
  "`title` is under 70 characters, in sentence case (only the first word and proper nouns capitalised), and reads like a sharp claim, not a topic.",
  "`argument` is one or two plain sentences, under 240 characters.",
  "`audience` is a specific role in lowercase (e.g. 'heads of support at B2B SaaS companies').",
  "`why` is one short sentence addressed to the founder as 'you': what you have seen that makes you credible, and why it is timely. Under 140 characters.",
  "`company.audience` is lowercase and under 80 characters. If there is no website, infer the company fields from the notes, or use 'Your company' and plain descriptions.",
  "Make the 4 ideas different in kind: one contrarian take, one how-to with a measurable test, one lesson from a common mistake, one about where the market is heading.",
  "Never invent facts or statistics. Use a number only if it appears in the notes or on the website; otherwise name what to measure instead of claiming a figure.",
].join(" ");

const BOLDER = "Be bolder than usual: each argument should make part of the audience uncomfortable or contradict common advice, while staying defensible with public evidence.";
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["company", "ideas"],
  properties: {
    company: {
      type: "object",
      additionalProperties: false,
      required: ["name", "oneLiner", "audience", "voice"],
      properties: { name: { type: "string" }, oneLiner: { type: "string" }, audience: { type: "string" }, voice: { type: "string", description: "How the brand sounds, in a few words" } },
    },
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "argument", "audience", "why"],
        properties: { title: { type: "string" }, argument: { type: "string" }, audience: { type: "string" }, why: { type: "string" } },
      },
    },
  },
} as const;

export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

const BARE_DOMAIN = /(?:^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)(?=\s|$)/i;

/** Split whatever the founder pasted into a website, links and their own words. */
export function readMaterial(material: string): { website: string | null; urls: string[]; notes: string } {
  const text = material.trim();
  const urls = [...new Set(text.match(/\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi) ?? [])];
  let website = urls[0] ?? null;
  let notes = urls.reduce((t, u) => t.replace(u, " "), text);
  if (!website) {
    const bare = notes.match(BARE_DOMAIN)?.[1];
    if (bare && !/@/.test(bare)) {
      website = normalizeUrl(bare);
      notes = notes.replace(bare, " ");
    }
  }
  return { website, urls: website && !urls.includes(website) ? [website, ...urls] : urls, notes: notes.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() };
}

/** Notes already make an argument: skip suggestions and confirm it instead. */
export function clearArgument(material: string): { thesis: string; audience: string | null; topic: string } | null {
  const { notes } = readMaterial(material);
  if (notes.length < 60) return null;
  const b = parseBrief({ body: material });
  return b.thesis && b.thesis.length >= 15 ? { thesis: b.thesis.charAt(0).toUpperCase() + b.thesis.slice(1), audience: b.audience, topic: b.topic } : null;
}

export async function suggestIdeas(args: { material: string; bold?: boolean; avoid?: string[] }): Promise<Ideas> {
  const key = env().OPENAI_API_KEY;
  if (!key) throw new Error("Suggestions aren't available right now. Write what you want to argue instead.");
  const { website, notes } = readMaterial(args.material);
  let page: { title: string | null; text: string } | null = null;
  if (website) {
    try {
      const p = await fetchPage(website);
      if (p.status < 400 && p.text.length >= 80) page = p;
    } catch {
      page = null;
    }
  }
  if (!page && notes.length < 30) throw new Error(website ? "We couldn't read that website. Check the address, or add a few lines about what you do." : "Add your website or a few lines about what you do.");
  const user = [
    notes ? `Founder's notes:\n${notes.slice(0, 6000)}` : "The founder gave no notes; work from the website.",
    website ? `Website: ${website}` : null,
    page?.title ? `Page title: ${page.title}` : null,
    page ? `Website text:\n${page.text.slice(0, 10_000)}` : null,
    args.avoid?.length ? `Do not repeat these ideas:\n${args.avoid.map((t) => `- ${t}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env().OPENAI_TEXT_MODEL,
      temperature: args.avoid?.length || args.bold ? 0.9 : 0.6,
      messages: [
        { role: "system", content: args.bold ? `${SYSTEM} ${BOLDER}` : SYSTEM },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: "article_ideas", strict: true, schema: JSON_SCHEMA } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError("openai", res.status, text);
  const content = (JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
  return ideasSchema.parse(JSON.parse(content));
}

/** The brief the pipeline receives. The founder's own material always travels with it. */
export function briefFromIdea(args: { material: string; company?: Ideas["company"] | null; idea: Pick<Ideas["ideas"][number], "title" | "argument" | "audience">; angle?: string | null }): { subject: string; body: string } {
  const { company, idea } = args;
  const { website, notes } = readMaterial(args.material);
  const strip = (s: string) => s.replace(/\.$/, "");
  return {
    subject: idea.title,
    body: [
      `Thesis: ${idea.argument.replace(/\s*\n+\s*/g, " ")}`,
      idea.audience ? `My audience is ${strip(idea.audience)}.` : null,
      company && company.name !== "Your company" ? `About us: ${company.name} — ${strip(company.oneLiner)}. We sell to ${strip(company.audience)}. Our voice: ${strip(company.voice)}.` : null,
      args.angle?.trim() ? `My own angle and experience: ${args.angle.trim()}` : null,
      notes ? `My notes:\n${notes}` : null,
      website ? `Our website: ${website}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
