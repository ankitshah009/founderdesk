import { z } from "zod";
import { env } from "@/lib/env";
import { fetchPage } from "@/lib/extract";
import { ProviderError } from "@/lib/integrations/http";

/**
 * Lower-friction start: read the founder's website and suggest arguments only
 * they can credibly make. One fast model call; the full research pipeline runs
 * later on the idea they pick.
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
    audience: clip(160),
    voice: clip(160),
  }),
  ideas: z
    .array(
      z.object({
        title: clip(100),
        argument: clip(320),
        audience: clip(120),
        why: clip(240),
      }),
    )
    .min(3)
    .max(5),
});
export type Ideas = z.infer<typeof ideasSchema>;

const SYSTEM = [
  "You are a sharp editor who helps startup founders find articles worth writing.",
  "From the company's website, infer what they sell, to whom, and what this founder sees every day that outsiders don't.",
  "Suggest 4 arguments the founder can credibly make. Each must be: a claim a smart reader could disagree with; about the reader's problem or market, never about the company or its product; specific (a mechanism, a number to measure, a named practice); useful enough that buyers would forward it.",
  "Never mention the company or its product in `title` or `argument`. No 'why X tools are essential', no listicles, no 'the future of'.",
  "`title` is under 70 characters and reads like a headline people click (a sharp claim, not a topic).",
  "`argument` is one or two plain sentences, under 240 characters.",
  "`audience` is a specific role in lowercase (e.g. 'heads of support at B2B SaaS companies').",
  "`why` is one sentence: what this founder has seen that makes them credible, and why it is timely.",
  "Make the 4 ideas different in kind: one contrarian take, one how-to with a measurable test, one lesson from a common mistake, one about where the market is heading.",
  "Never invent facts or statistics. Use a number only if it appears on the website; otherwise name what to measure instead of claiming a figure.",
].join(" ");

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

export async function suggestIdeas(args: { url: string; note?: string | null }): Promise<Ideas> {
  const key = env().OPENAI_API_KEY;
  if (!key) throw new Error("Suggestions aren't available right now — write your own angle below.");
  const page = await fetchPage(normalizeUrl(args.url));
  if (page.status >= 400 || page.text.length < 80) throw new Error("We couldn't read that website. Check the address, or write your own angle below.");
  const user = [
    `Website: ${normalizeUrl(args.url)}`,
    page.title ? `Page title: ${page.title}` : null,
    args.note ? `The founder adds: ${args.note.slice(0, 1500)}` : null,
    `Website text:\n${page.text.slice(0, 12_000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env().OPENAI_TEXT_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
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

/** The brief the pipeline receives for a picked idea. */
export function briefFromIdea(args: { url: string; company: Ideas["company"]; idea: Ideas["ideas"][number]; angle?: string | null }): { subject: string; body: string } {
  const { company, idea } = args;
  return {
    subject: idea.title,
    body: [
      `Thesis: ${idea.argument.replace(/\s*\n+\s*/g, " ")}`,
      `My audience is ${idea.audience.replace(/\.$/, "")}.`,
      `About us: ${company.name} — ${company.oneLiner.replace(/\.$/, "")}. We sell to ${company.audience.replace(/\.$/, "")}. Our voice: ${company.voice.replace(/\.$/, "")}.`,
      args.angle?.trim() ? `My own angle and experience: ${args.angle.trim()}` : null,
      `Our website: ${normalizeUrl(args.url)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
