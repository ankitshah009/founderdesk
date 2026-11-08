import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { articleDaily, publications } from "@/lib/db/schema";

/**
 * First-party reader counts for published articles: a view when the page
 * opens, a read when the reader scrolls most of the way through. No cookies,
 * no identifiers, nothing sent to a third party. Obvious bots are ignored.
 */
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|FounderDeskVerifier|HeadlessChrome|curl|wget/i;

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  let body: { slug?: unknown; event?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.slice(0, 200) : "";
  const event = body.event === "read" ? "read" : body.event === "view" ? "view" : null;
  if (!slug || !event) return new Response(null, { status: 400 });
  const db = await getDb();
  const [pub] = await db
    .update(publications)
    .set(event === "view" ? { views: sql`${publications.views} + 1` } : { reads: sql`${publications.reads} + 1` })
    .where(and(eq(publications.slug, slug), eq(publications.destination, "web"), inArray(publications.status, ["published"])))
    .returning({ id: publications.id });
  if (pub) {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .insert(articleDaily)
      .values({ publicationId: pub.id, day, views: event === "view" ? 1 : 0, reads: event === "read" ? 1 : 0 })
      .onConflictDoUpdate({
        target: [articleDaily.publicationId, articleDaily.day],
        set: event === "view" ? { views: sql`${articleDaily.views} + 1` } : { reads: sql`${articleDaily.reads} + 1` },
      });
  }
  return new Response(null, { status: 204 });
}
