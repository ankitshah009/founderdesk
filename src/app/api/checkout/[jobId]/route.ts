import { NextResponse } from "next/server";
import { verifyLink } from "@/lib/security";
import { checkoutUrlFor } from "@/lib/workflow/payments";
import { getJob } from "@/lib/workflow/store";

/** The link in the acknowledgement email: create/reuse a Checkout Session and redirect. */
export async function GET(req: Request, ctx: RouteContext<"/api/checkout/[jobId]">) {
  const { jobId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (verifyLink(token, "order") !== jobId) return new NextResponse("Invalid or expired link", { status: 404 });
  const job = await getJob(jobId);
  if (!job) return new NextResponse("Order not found", { status: 404 });
  const url = await checkoutUrlFor(job);
  return NextResponse.redirect(new URL(url, req.url), 303);
}
