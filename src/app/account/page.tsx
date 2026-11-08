import { asc, desc, eq, inArray } from "drizzle-orm";
import { nowMs } from "@/lib/clock";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { currentActivity } from "@/components/activity";
import { AutoRefresh } from "@/components/auto-refresh";
import { Footer, Nav } from "@/components/chrome";
import { IN_PROGRESS, STAGE_LABEL, StageChip } from "@/components/stages";
import { ButtonLink, cn } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { dispatches, jobs, publications, sources, type JobStage } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { links } from "@/lib/links";
import { currentSession } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const STEPS: Array<{ label: string; stages: JobStage[] }> = [
  { label: "Paid", stages: ["PAID"] },
  { label: "Research", stages: ["RESEARCHING"] },
  { label: "Draft & review", stages: ["WRITING", "REVIEWING", "WAITING_FOR_FOUNDER"] },
  { label: "Your approval", stages: ["READY_FOR_APPROVAL"] },
  { label: "Live", stages: ["PUBLISHING", "PUBLISHED", "COMPLETE"] },
];
const ORDER: JobStage[] = ["AWAITING_PAYMENT", "PAID", "RESEARCHING", "WRITING", "REVIEWING", "WAITING_FOR_FOUNDER", "READY_FOR_APPROVAL", "PUBLISHING", "PUBLISHED", "COMPLETE"];

function Progress({ stage }: { stage: JobStage }) {
  const at = ORDER.indexOf(stage);
  return (
    <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label={`Progress: ${STAGE_LABEL[stage]}`}>
      {STEPS.map((s) => {
        const first = Math.min(...s.stages.map((x) => ORDER.indexOf(x)));
        const last = Math.max(...s.stages.map((x) => ORDER.indexOf(x)));
        const done = at > last || stage === "COMPLETE";
        const current = at >= first && at <= last && stage !== "COMPLETE";
        return (
          <li key={s.label}>
            <div className={cn("h-1.5 rounded-full", done ? "bg-accent" : current ? "bg-accent/50 pulse-dot" : "bg-white/10")} />
            <p className={cn("mt-2 text-[11px]", done || current ? "text-fg-2" : "text-subtle")}>{s.label}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function AccountPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Suspense fallback={<div className="mx-auto mt-16 h-64 max-w-3xl rounded-3xl bg-white/[0.03]" aria-busy />}>
          <Orders />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function Orders() {
  await connection();
  const session = await currentSession();
  if (!session) redirect("/signin");
  const email = session.email;
  const db = await getDb();
  const rows = await db.select().from(jobs).where(eq(jobs.founderEmail, email)).orderBy(desc(jobs.createdAt)).limit(50);
  const pubs = rows.length ? await db.select().from(publications).where(eq(publications.destination, "web")) : [];
  const ids = rows.map((r) => r.id);
  const [work, srcs] = ids.length
    ? await Promise.all([
        db.select().from(dispatches).where(inArray(dispatches.jobId, ids)).orderBy(asc(dispatches.createdAt)),
        db.select().from(sources).where(inArray(sources.jobId, ids)),
      ])
    : [[], []];
  const live = rows.some((r) => IN_PROGRESS.includes(r.stage) || r.stage === "WAITING_FOR_FOUNDER");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-accent-ink uppercase">Signed in as {email}</p>
          <h1 className="display-md mt-3 text-fg">Your orders</h1>
        </div>
        <div className="flex items-center gap-4">
          {live ? <AutoRefresh tickUrl={`/api/orders/${rows[0]!.id}/tick?t=${encodeURIComponent(new URL(links.order(rows[0]!.id)).searchParams.get("t")!)}`} active everyMs={6000} /> : null}
          <ButtonLink href="/start">New article</ButtonLink>
        </div>
      </div>
      <ul className="mt-10 space-y-4">
        {rows.map((j) => {
          const pub = pubs.find((p) => p.jobId === j.id && p.status === "published");
          const next =
            j.stage === "AWAITING_PAYMENT"
              ? { href: links.checkoutPath(j.id), label: "Pay $" + (Math.min(j.amountCents, env().OFFER_AMOUNT_CENTS) / 100).toFixed(0) }
              : j.stage === "READY_FOR_APPROVAL" || j.stage === "WAITING_FOR_FOUNDER"
                ? { href: links.reviewPath(j.id), label: j.stage === "READY_FOR_APPROVAL" ? "Review & approve" : "Read the draft" }
                : pub?.url
                  ? { href: pub.url, label: "Open article" }
                  : { href: links.orderPath(j.id), label: "Details" };
          return (
            <li key={j.id} className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold tracking-[-0.02em] text-fg">{j.topic}</p>
                  <p className="mt-1 text-xs text-muted">{j.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {j.stageReason ?? STAGE_LABEL[j.stage]}</p>
                </div>
                <StageChip stage={j.stage} scheduled={j.stage === "PUBLISHING" && !!j.publishAt && new Date(j.publishAt).getTime() > nowMs()} />
              </div>
              {j.stage !== "AWAITING_PAYMENT" && j.stage !== "UNABLE_TO_COMPLETE" ? <Progress stage={j.stage} /> : null}
              {(() => {
                const now = currentActivity(j, work.filter((w) => w.jobId === j.id), srcs.filter((x) => x.jobId === j.id));
                return now ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-fg-2">
                    <span className="size-1.5 rounded-full bg-accent pulse-dot" aria-hidden /> Now: {now}
                  </p>
                ) : null;
              })()}
              {j.stage === "WAITING_FOR_FOUNDER" && j.openQuestions[0] ? (
                <p className="mt-4 rounded-xl bg-accent-tint px-4 py-3 text-sm text-fg">{j.openQuestions[0]} <span className="text-fg-2/70">— reply to our email, or we&apos;ll continue with the safe choice shortly.</span></p>
              ) : null}
              <div className="mt-5 flex gap-4 text-sm">
                <Link href={next.href} className="inline-flex items-center gap-1.5 font-semibold text-accent-ink hover:text-accent">
                  {next.label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                <Link href={links.orderPath(j.id)} className="text-muted hover:text-fg">Order details</Link>
              </div>
            </li>
          );
        })}
        {!rows.length ? <li className="rounded-3xl border border-line p-10 text-center text-muted">No orders yet for this email.</li> : null}
      </ul>
      <div className="mt-12 flex flex-wrap gap-3 border-t border-line pt-6 text-sm">
        <form action={signOutAction}>
          <button className="text-muted hover:text-fg">Sign out</button>
        </form>
        <form action={signOutAction}>
          <input type="hidden" name="everywhere" value="1" />
          <button className="text-muted hover:text-fg">Sign out on all devices</button>
        </form>
      </div>
    </div>
  );
}
