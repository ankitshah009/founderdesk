import { desc, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, Check } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { IN_PROGRESS, StageChip } from "@/components/stages";
import { Card, PageHead, ProgressRing, SignedOut, Skeleton, timeAgo } from "@/components/studio/shared";
import { ButtonLink, Chip, cn } from "@/components/ui";
import { StudioTour, TakeTourButton, type TourStep } from "@/components/studio/tour";
import { setupSteps } from "@/lib/studio/setup";
import { getDb } from "@/lib/db/client";
import { reviews, type Job, type JobStage, type Review } from "@/lib/db/schema";
import { links } from "@/lib/links";
import { signLink } from "@/lib/security";
import { AGENT_TEAM } from "@/lib/studio/presets";
import { studioSession } from "@/lib/studio/session";
import { agentLog, founderJobs, getProfile, listKnowledge } from "@/lib/studio/store";

export const metadata: Metadata = { title: "Overview" };

export default function StudioOverview() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Overview />
    </Suspense>
  );
}

const COLUMNS: Array<{ label: string; stages: JobStage[] }> = [
  { label: "Researching", stages: ["PAID", "RESEARCHING"] },
  { label: "Drafting", stages: ["WRITING"] },
  { label: "Fact-check & review", stages: ["REVIEWING"] },
  { label: "Needs you", stages: ["WAITING_FOR_FOUNDER", "READY_FOR_APPROVAL"] },
  { label: "Live", stages: ["PUBLISHING", "PUBLISHED", "COMPLETE"] },
];
const ATTENTION: JobStage[] = ["READY_FOR_APPROVAL", "WAITING_FOR_FOUNDER", "UNABLE_TO_COMPLETE"];
const TOUR_COPY: Record<string, { title: string; body: string; cta: string }> = {
  brand: { title: "Capture your brand", body: "Paste your website, upload a deck or write a paragraph. We pull out what you sell, who it's for and the words you use.", cta: "Capture it" },
  voice: { title: "Teach it your voice", body: "Add something you wrote, or start from a built-in voice. The Writer matches your sentence length, contractions and phrases.", cta: "Add a sample" },
  style: { title: "Set your style guide", body: "Tone, words you prefer and phrases you never want to see. The Editor enforces them on every draft.", cta: "Set the guide" },
  personas: { title: "Pick your readers", body: "Investors, customers, developers: each article is aimed at one of them. Keep the defaults or make them yours.", cta: "Review personas" },
  article: { title: "Start your first article", body: "Drop in rough notes. Researcher, Writer, Editor, Fact-checker and Reviewer take it from there. Your first one is free.", cta: "Start writing" },
};
const ROLE_NAME = Object.fromEntries(AGENT_TEAM.map((a) => [a.role, a.name])) as Record<string, string>;

function scoreTone(n: number) {
  return n >= 80 ? "green" : n >= 60 ? "amber" : "red";
}

async function Overview() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { email } = session;
  const [profile, knowledge, jobs] = await Promise.all([getProfile(email), listKnowledge(email), founderJobs(email)]);
  const ids = jobs.map((j) => j.id);
  const db = await getDb();
  const [log, reviewRows] = await Promise.all([
    agentLog(ids, 30),
    ids.length ? db.select().from(reviews).where(inArray(reviews.jobId, ids)).orderBy(desc(reviews.createdAt)) : Promise.resolve([] as Review[]),
  ]);
  const latestReview = new Map<string, Review>();
  for (const r of reviewRows) if (!latestReview.has(r.jobId)) latestReview.set(r.jobId, r);
  const topicOf = new Map(jobs.map((j) => [j.id, j.topic]));

  const samples = knowledge.filter((k) => k.kind === "sample").length;
  const steps = setupSteps(profile, { samples, jobs: jobs.length });
  const doneCount = steps.filter((s) => s.done).length;
  const tour: TourStep[] = steps.map((s) => ({ title: TOUR_COPY[s.key].title, body: TOUR_COPY[s.key].body, cta: TOUR_COPY[s.key].cta, target: s.tourTarget, href: s.href, done: s.done }));

  const attention = jobs.filter((j) => ATTENTION.includes(j.stage));
  const live = jobs.find((j) => IN_PROGRESS.includes(j.stage) && j.stage !== "PUBLISHED");

  return (
    <>
      <StudioTour steps={tour} autoStart={doneCount < steps.length} />
      <PageHead
        label="Studio"
        title={profile.brand?.name ? `${profile.brand.name}'s desk` : "Your desk"}
        lede="Everything the desk knows about you, and everything it's working on."
      >
        <div className="flex items-center gap-3">
          {live ? <AutoRefresh tickUrl={`/api/orders/${live.id}/tick?t=${encodeURIComponent(signLink(live.id, "order"))}`} active /> : null}
          <TakeTourButton />
          <ButtonLink href="/start">
            Start an article <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {doneCount < steps.length || !profile.onboardedAt ? (
          <Card title="Get set up" aside={<ProgressRing value={doneCount / steps.length} size={52} />}>
            <ol className="divide-y divide-line">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="group flex items-center gap-3 py-3">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", s.done ? "border-accent bg-accent text-[#140a05]" : "border-line-strong")}>
                      {s.done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", s.done ? "text-muted line-through decoration-white/20" : "text-fg")}>{s.label}</span>
                      <span className="block text-xs text-subtle">{s.hint}</span>
                    </span>
                    <ArrowRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <Card title="You're set up">
            <p className="text-sm text-muted">Brand, voice, style guide and personas are in place. Keep adding samples and knowledge — every article gets better for it.</p>
          </Card>
        )}

        <Card title="Needs your attention" aside={attention.length ? <Chip tone="accent">{attention.length}</Chip> : null}>
          {attention.length ? (
            <ul className="space-y-2.5">
              {attention.map((j) => (
                <AttentionItem key={j.id} job={j} review={latestReview.get(j.id)} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing waiting on you. We&apos;ll email you when a draft is ready to approve.</p>
          )}
        </Card>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-fg">Pipeline</h2>
          <span className="text-xs text-muted">{jobs.length} article{jobs.length === 1 ? "" : "s"}</span>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[880px] grid-cols-5 gap-3">
            {COLUMNS.map((col) => {
              const items = jobs.filter((j) => col.stages.includes(j.stage));
              return (
                <div key={col.label} className="rounded-xl border border-line bg-white/[0.015] p-2.5">
                  <div className="mb-2.5 flex items-center justify-between px-1">
                    <span className="mono-label">{col.label}</span>
                    <span className="text-xs tabular-nums text-subtle">{items.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {items.slice(0, 8).map((j) => {
                      const score = latestReview.get(j.id)?.scores?.overall;
                      const href = `/studio/articles/${j.id}`;
                      return (
                        <li key={j.id}>
                          <Link href={href} className="block rounded-lg border border-line bg-panel p-3 transition-colors hover:border-line-strong">
                            <p className="line-clamp-2 text-sm text-fg">{j.topic}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-subtle">{timeAgo(j.updatedAt)}</span>
                              {score != null ? <Chip tone={scoreTone(score)}>{score}</Chip> : IN_PROGRESS.includes(j.stage) && col.label !== "Live" ? <span className="size-1.5 rounded-full bg-blue pulse-dot" aria-label="In progress" /> : null}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                    {!items.length ? <li className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs text-subtle">Empty</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <Card title="Agent desk" aside={<Link href="/studio/agents" className="text-xs text-muted hover:text-fg">Meet the team</Link>}>
          {log.length ? (
            <ol className="relative space-y-5 border-l border-line pl-5">
              {log.map((r) => (
                <li key={r.id} className="relative">
                  <span aria-hidden className="absolute -left-[23.5px] top-1.5 size-2 rounded-full border border-bg bg-accent" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="neutral">{ROLE_NAME[r.role] ?? r.role}</Chip>
                    <span className="text-sm text-fg">{r.action}</span>
                    {r.simulated ? <Chip tone="amber">simulated</Chip> : null}
                    <span className="ml-auto text-xs text-subtle">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{topicOf.get(r.jobId)}</p>
                  {r.detail.length ? (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-fg-2">
                      {r.detail.slice(0, 4).map((d, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-subtle">·</span>
                          <span className="min-w-0">{d}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">When you start an article, the Researcher, Writer, Editor, Fact-checker and Reviewer log their work here.</p>
          )}
        </Card>
      </section>
    </>
  );
}

function AttentionItem({ job, review }: { job: Job; review?: Review }) {
  const score = review?.scores?.overall;
  const why =
    job.stage === "WAITING_FOR_FOUNDER"
      ? (job.openQuestions[0] ?? job.stageReason ?? "The desk has a question for you.")
      : job.stage === "UNABLE_TO_COMPLETE"
        ? (job.stageReason ?? "The desk couldn't finish this one.")
        : (review?.summary ?? job.stageReason ?? "A draft is ready for your approval.");
  return (
    <li className="flex items-stretch gap-2">
      <Link href={`/studio/articles/${job.id}`} className="group flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-white/[0.02]">
        {score != null ? (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums ring-1 ring-inset", score >= 80 ? "bg-green/10 text-green ring-green/25" : score >= 60 ? "bg-amber/10 text-amber ring-amber/25" : "bg-red/10 text-red ring-red/25")} title="Quality score">
            {score}
          </span>
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-xs text-subtle">—</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm text-fg">{job.topic}</span>
            <StageChip stage={job.stage} />
          </span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted">{why}</span>
        </span>
        <ArrowRight className="mt-1 size-3.5 shrink-0 text-subtle group-hover:text-fg" aria-hidden />
      </Link>
      {job.stage === "READY_FOR_APPROVAL" ? (
        <ButtonLink href={links.reviewPath(job.id)} className="self-center">Review</ButtonLink>
      ) : null}
    </li>
  );
}
