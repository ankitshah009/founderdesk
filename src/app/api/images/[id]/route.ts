import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { images } from "@/lib/db/schema";

/** Serve a generated image (ids are unguessable UUIDs). */
export async function GET(_: Request, ctx: RouteContext<"/api/images/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [img] = await db.select({ mime: images.mime, data: images.data, status: images.status }).from(images).where(eq(images.id, id)).limit(1);
  if (!img || img.status !== "ready" || !img.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.mime ?? "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
}
