import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { claimFreeArticle } from "@/app/actions";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { isFreeEligible } from "@/lib/workflow/intake";
import { getJob } from "@/lib/workflow/store";

export const metadata: Metadata = { title: "Start your free article", robots: { index: false } };

/** Reached only from the emailed link — which is what proves the address. */
export default function FreePage(props: PageProps<"/orders/[jobId]/free">) {
  return (
    <main className="glow-warm flex min-h-dvh flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-8">
        <Wordmark />
        <Suspense fallback={null}>
          <Claim {...props} />
        </Suspense>
      </div>
    </main>
  );
}

async function Claim({ params, searchParams }: PageProps<"/orders/[jobId]/free">) {
  await connection();
  const { jobId } = await params;
  const t = (await searchParams).t;
  const token = typeof t === "string" ? t : "";
  if (verifyLink(token, "free") !== jobId) notFound();
  const job = await getJob(jobId);
  if (!job) notFound();
  if (job.paymentStatus === "paid") redirect(links.orderPath(jobId));
  if (!(await isFreeEligible(job.founderEmail))) redirect(links.orderPath(jobId));
  return (
    <form action={claimFreeArticle} className="mt-8 space-y-5">
      <input type="hidden" name="t" value={token} />
      <h1 className="text-3xl font-semibold tracking-[-0.04em] text-fg">Your first article is on us</h1>
      <p className="text-muted">
        Research starts as soon as you confirm. You&apos;ll get one email if we need you, and a private link to approve the exact text before anything is published.
      </p>
      <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-fg-2">{job.topic}</p>
      <Button type="submit" className="w-full py-3">
        Start my free article
      </Button>
    </form>
  );
}
