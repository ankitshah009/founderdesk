import { NextResponse } from "next/server";
import { isLive } from "@/lib/env";
import { createImagePackCheckout } from "@/lib/integrations/stripe";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { getJob } from "@/lib/workflow/store";

/** Start Checkout for the images add-on from the private review page. */
export async function GET(req: Request, ctx: RouteContext<"/api/checkout/[jobId]/images">) {
  const { jobId } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (verifyLink(t, "review") !== jobId) return new NextResponse("Invalid or expired link", { status: 404 });
  const job = await getJob(jobId);
  if (!job) return new NextResponse("Order not found", { status: 404 });
  if (!isLive("stripe")) return new NextResponse("Payments are not connected on this deployment", { status: 503 });
  const back = links.review(jobId);
  const session = await createImagePackCheckout({ jobId, founderEmail: job.founderEmail, successUrl: `${back}?images=1&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: back });
  return NextResponse.redirect(session.url!, 303);
}
