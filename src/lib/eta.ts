import "server-only";
import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dispatches } from "@/lib/db/schema";
import { nowMs } from "@/lib/clock";

/** Median-ish (average) seconds per step kind over the last 14 days of real runs. */
export async function avg(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ kind: dispatches.kind, secs: sql<number>`avg(extract(epoch from (${dispatches.finishedAt} - ${dispatches.startedAt})))::float` })
    .from(dispatches)
    .where(and(eq(dispatches.status, "succeeded"), eq(dispatches.simulated, false), isNotNull(dispatches.startedAt), isNotNull(dispatches.finishedAt), gt(dispatches.createdAt, new Date(nowMs() - 14 * 86400_000))))
    .groupBy(dispatches.kind);
  return Object.fromEntries(rows.filter((r) => r.secs > 0).map((r) => [r.kind, Math.round(r.secs)]));
}
