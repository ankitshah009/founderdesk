import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowUpRight, Mail, Smartphone } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Footer, Nav } from "@/components/chrome";
import { IN_PROGRESS, StageChip, Timeline } from "@/components/stages";
import { ButtonLink, Chip, MonoLabel } from "@/components/ui";
import { env, isLive } from "@/lib/env";
import { stripe } from "@/lib/integrations/stripe";
import { links } from "@/lib/links";
import { verifyLink } from "@/lib/security";
import { orderView, type OrderView } from "@/lib/views";
import { isFreeEligible } from "@/lib/workflow/intake";
import { usableThesis } from "@/lib/workflow/outbound";
import { fulfillPayment } from "@/lib/workflow/payments";
import { kick } from "@/lib/workflow/run";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default function OrderPage(props: PageProps<"/orders/[jobId]">) {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Suspense fallback={<OrderSkeleton />}>
          <Order {...props} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function OrderSkeleton() {
  return (
    <div className="frame px-4 py-16 md:px-12" aria-busy>
      <div className="h-4 w-24 rounded bg-white/5" />
      <div className="mt-6 h-10 w-2/3 rounded bg-white/5" />
      <div className="mt-10 h-64 rounded-xl bg-white/[0.03]" />
    </div>
  );
}

async function Order({ params, searchParams }: PageProps<"/orders/[jobId]">) {
  await connection();
  const { jobId } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  if (verifyLink(token, "order") !== jobId) notFound();

  // Stripe return page: fulfil here too (idempotent with the webhook).
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  if (sessionId && isLive("stripe")) {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.job_id === jobId && session.payment_status === "paid") {
      const res = await fulfillPayment({ jobId, checkoutSessionId: session.id, amountTotal: session.amount_total });
      if (res.fulfilled) kick();
    }
  }

  const view = await orderView(jobId);
  if (!view) notFound();
  const { job } = view;
  const tickUrl = `/api/orders/${jobId}/tick?t=${encodeURIComponent(token)}`;
  const payUrl = job.paymentStatus === "unpaid" ? links.checkoutPath(job.id) : null;
  const freeEligible = job.paymentStatus === "unpaid" && (await isFreeEligible(job.founderEmail));

  return (
    <div className="frame px-4 py-14 md:px-12 md:py-16">
      <div className="flex flex-wrap items-center gap-3">
        <MonoLabel>Order {job.id.slice(0, 8).toUpperCase()}</MonoLabel>
        <StageChip stage={job.stage} />
        <AutoRefresh tickUrl={tickUrl} active={IN_PROGRESS.includes(job.stage)} />
      </div>
      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Headline view={view} payUrl={payUrl} freeEligible={freeEligible} />
          <div className="panel mt-10 p-6 md:p-8">
            <Timeline stage={job.stage} />
          </div>
        </div>
        <aside className="space-y-4">
          <Details view={view} />
          <Messages view={view} />
        </aside>
      </div>
    </div>
  );
}

function Headline({ view, payUrl, freeEligible }: { view: OrderView; payUrl: string | null; freeEligible: boolean }) {
  const { job, web } = view;
  const block = (title: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div>
      <h1 className="h1 text-fg">{title}</h1>
      <div className="lede mt-4 max-w-xl">{body}</div>
      {action ? <div className="mt-7 flex flex-wrap gap-2.5">{action}</div> : null}
    </div>
  );
  switch (job.stage) {
    case "AWAITING_PAYMENT":
      return block(
        "Your brief is in",
        <>{usableThesis(job) ? <>We&apos;ll argue: <span className="text-fg-2">{usableThesis(job)}</span></> : <>Topic: <span className="text-fg-2">{job.topic}</span></>}{job.audience ? <> — for {job.audience}</> : null}. Pay to start research.</>,
        freeEligible ? (
          <p className="rounded-xl bg-accent-tint px-4 py-3 text-sm text-fg">
            Your first article is free — open the email we sent to <span className="font-semibold">{job.founderEmail}</span> and confirm it&apos;s you to start.
          </p>
        ) : payUrl ? (
          <ButtonLink href={payUrl} prefetch={false}>
            Pay ${(Math.min(job.amountCents, env().OFFER_AMOUNT_CENTS) / 100).toFixed(0)} and start research
          </ButtonLink>
        ) : null,
      );
    case "PAID":
    case "RESEARCHING":
      return block("Researching your argument", "We're reading your attachments and links and searching for evidence. Only passages that actually appear in a source are kept.");
    case "WRITING":
      return block("Writing your draft", job.stageReason ?? "Drafting in your voice with a source beside every claim.");
    case "REVIEWING":
      return block("Checking every claim", job.stageReason ?? "The reviewer is holding each number and scope to its source.");
    case "WAITING_FOR_FOUNDER":
      return block(
        "We need one answer from you",
        <>
          <ul className="space-y-2">
            {job.openQuestions.map((q) => (
              <li key={q} className="rounded-lg border border-accent/25 bg-accent-tint px-4 py-3 text-[15px] text-fg">
                {q}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-sm">
            <Mail className="size-4" aria-hidden /> Reply to our email — your answer resumes the work automatically.
          </p>
        </>,
        view.draft ? (
          <ButtonLink href={links.reviewPath(job.id)} variant="secondary">
            Read the current draft
          </ButtonLink>
        ) : null,
      );
    case "READY_FOR_APPROVAL":
      return block("Your article is ready for review", "Read the exact text, see the sources beside each claim, then approve or edit.", <ButtonLink href={links.reviewPath(job.id)}>Review and approve</ButtonLink>);
    case "PUBLISHING":
      return block("Publishing", job.stageReason ?? "Creating the page and fetching it back to confirm the approved version is served.");
    case "PUBLISHED":
    case "COMPLETE":
      return block(
        job.stage === "COMPLETE" ? "Live and checked" : "Live — running the phone check",
        <>
          Your article is published at{" "}
          <Link href={web?.url ?? "#"} className="text-fg underline decoration-white/30 underline-offset-4">
            {web?.url}
          </Link>
        </>,
        web?.url ? (
          <ButtonLink href={web.url} target="_blank">
            Open the article <ArrowUpRight className="size-3.5" aria-hidden />
          </ButtonLink>
        ) : null,
      );
    case "UNABLE_TO_COMPLETE":
      return block("This order needs a person", <>{job.stageReason ?? "Something stopped the workflow."} We&apos;ve flagged it and will follow up by email.</>);
  }
}

function Details({ view }: { view: OrderView }) {
  const { job, web, draft } = view;
  const rows: Array<[string, React.ReactNode]> = [
    ["Topic", job.topic],
    ["Audience", job.audience ?? "—"],
    ["Placed", job.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })],
    ["Price", `$${(job.amountCents / 100).toFixed(2)}`],
    ["Payment", job.paymentStatus === "paid" ? <Chip tone="green">Paid</Chip> : <Chip>Unpaid</Chip>],
    ["Draft", draft ? `v${draft.version}` : "—"],
  ];
  return (
    <div className="panel p-5">
      <p className="text-sm text-fg">Order details</p>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
      {web?.mobileCheck ? (
        <div className="mt-5 rounded-lg border border-line bg-panel-2 p-3 text-sm">
          <p className="flex items-center gap-2 text-fg">
            <Smartphone className="size-4 text-muted" aria-hidden /> Phone check
            <Chip tone={web.mobileCheck.status === "passed" ? "green" : web.mobileCheck.status === "running" ? "blue" : "amber"}>{web.mobileCheck.status}</Chip>
          </p>
          <p className="mt-1.5 text-xs text-muted">{web.mobileCheck.mode === "device" ? "Checked on a real phone via Mobile Run." : "HTTP check only — no device connected."}</p>
          {web.mobileCheck.layoutProblems?.length ? <p className="mt-1.5 text-xs text-amber">{web.mobileCheck.layoutProblems.join("; ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Messages({ view }: { view: OrderView }) {
  if (!view.outbox.length) return null;
  return (
    <div className="panel p-5">
      <p className="text-sm text-fg">Emails to you</p>
      <ul className="mt-3 divide-y divide-line">
        {view.outbox.map((m) => (
          <li key={m.id} className="py-2.5 text-sm">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-fg-2">
                <span className="capitalize">{m.kind.replace(/_/g, " ")}</span>
                <span className="text-xs text-subtle">{m.state === "simulated" ? "preview · not sent" : m.state}</span>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-panel-2 p-3 font-sans text-xs leading-relaxed text-muted">{m.text}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
