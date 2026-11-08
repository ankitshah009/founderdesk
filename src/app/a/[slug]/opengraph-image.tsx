import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { drafts, jobs, publications } from "@/lib/db/schema";

export const alt = "FounderDesk article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share image for each published article: headline on the brand's warm glow. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ title: drafts.title, author: jobs.founderName })
    .from(publications)
    .innerJoin(drafts, eq(drafts.id, publications.draftId))
    .innerJoin(jobs, eq(jobs.id, publications.jobId))
    .where(and(eq(publications.slug, slug), eq(publications.status, "published")))
    .limit(1);
  const title = row?.title ?? "FounderDesk";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#f3eee8",
          background: "radial-gradient(60% 60% at 15% 10%, rgba(255,90,31,0.55), transparent 70%), radial-gradient(50% 55% at 90% 80%, rgba(200,30,45,0.45), transparent 70%), #0b0a09",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: "#ff5a1f" }} />
          FounderDesk
        </div>
        <div style={{ display: "flex", fontSize: title.length > 70 ? 58 : 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 26, color: "#d9d1c8" }}>{row?.author ? `By ${row.author} · ` : ""}Every claim sourced and checked</div>
      </div>
    ),
    size,
  );
}
