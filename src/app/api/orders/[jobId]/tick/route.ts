import { NextResponse } from "next/server";
import { verifyLink } from "@/lib/security";
import { kick } from "@/lib/workflow/run";

export const maxDuration = 60;

/** Called by an open order or review page to keep its job moving. Leased and idempotent. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[jobId]/tick">) {
  const { jobId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (verifyLink(token, "order") !== jobId && verifyLink(token, "review") !== jobId) {
    return NextResponse.json({ error: "invalid link" }, { status: 404 });
  }
  kick();
  return NextResponse.json({ ok: true });
}
