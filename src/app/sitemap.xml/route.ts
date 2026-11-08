import { connection } from "next/server";
import { env } from "@/lib/env";
import { publishedArticles } from "@/lib/published";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  await connection();
  const base = env().APP_URL.replace(/\/$/, "");
  const articles = await publishedArticles();
  const urls = [
    { loc: `${base}/`, lastmod: null as string | null },
    { loc: `${base}/articles`, lastmod: articles[0]?.publishedAt.toISOString() ?? null },
    ...articles.map((a) => ({ loc: `${base}/a/${a.slug}`, lastmod: a.publishedAt.toISOString() })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
