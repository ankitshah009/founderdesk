import { connection } from "next/server";
import { env } from "@/lib/env";
import { publishedArticles } from "@/lib/published";

/** llms.txt — a plain index AI crawlers and answer engines can read. */
export async function GET() {
  await connection();
  const base = env().APP_URL.replace(/\/$/, "");
  const articles = await publishedArticles(200);
  const body = [
    "# FounderDesk",
    "",
    "> Researched, source-checked articles written with startup founders and approved word for word before publication. Every factual claim cites its source.",
    "",
    "## Articles",
    "",
    ...articles.map((a) => `- [${a.title}](${base}/a/${a.slug}): ${a.dek}`),
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
