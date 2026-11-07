import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Lock } from "lucide-react";
import { simulatePayment } from "@/app/actions";
import { Wordmark } from "@/components/brand";
import { Button, Chip } from "@/components/ui";
import { isLive } from "@/lib/env";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { getJob } from "@/lib/workflow/store";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

/**
 * Stand-in for Stripe Checkout when no Stripe keys are configured. It calls
 * the same fulfillment function as the Stripe webhook and is labelled as a
 * test everywhere; it is unreachable once Stripe is connected.
 */
export default function PayPage(props: PageProps<"/orders/[jobId]/pay">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <Suspense fallback={null}>
        <Pay {...props} />
      </Suspense>
    </div>
  );
}

async function Pay({ params, searchParams }: PageProps<"/orders/[jobId]/pay">) {
  await connection();
  const { jobId } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  if (verifyLink(token, "order") !== jobId) notFound();
  if (isLive("stripe")) redirect(links.checkoutPath(jobId));
  const job = await getJob(jobId);
  if (!job) notFound();
  if (job.paymentStatus === "paid") redirect(links.orderPath(jobId));
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center justify-between">
        <Wordmark />
        <Chip tone="amber">Test mode — no card is charged</Chip>
      </div>
      <div className="panel p-6">
        <p className="text-sm text-muted">FounderDesk — researched, reviewed, published article</p>
        <p className="mt-1 text-sm text-fg-2">{job.topic}</p>
        <p className="mt-6 text-4xl font-medium tracking-[-0.03em] text-fg">${(job.amountCents / 100).toFixed(2)}</p>
        <div className="mt-6 rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
          Stripe isn&apos;t connected on this deployment, so this page stands in for Checkout. Completing it runs the same fulfillment path as a verified Stripe webhook.
        </div>
        <form action={simulatePayment} className="mt-6">
          <input type="hidden" name="t" value={token} />
          <Button type="submit" className="w-full py-2.5">
            <Lock className="size-3.5" aria-hidden /> Complete test payment
          </Button>
        </form>
      </div>
    </div>
  );
}
