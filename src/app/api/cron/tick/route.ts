import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security";
import { runWork } from "@/lib/workflow/run";

export const maxDuration = 60;

/** Backstop for polling remote work (Naïve, Monid, Mobile Run) when no page is open. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (env().NODE_ENV === "production" && (!secret || !safeEqual(auth, `Bearer ${secret}`))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const { steps } = await runWork({ budgetMs: 50_000 });
  return NextResponse.json({ ok: true, steps });
}
