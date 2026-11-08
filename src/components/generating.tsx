import type { Dispatch, DispatchKind, JobStage } from "@/lib/db/schema";
import { nowMs } from "@/lib/clock";

/** Fallback step durations (seconds) until there is history to learn from. */
const DEFAULT: Record<DispatchKind, number> = {
  research_plan: 25, source_search: 15, source_fetch: 10, research_synthesis: 35, write: 60, review: 35, publish: 8, mobile_check: 90, image: 30, revise_selection: 20,
};
const REMAINING: Partial<Record<JobStage, DispatchKind[]>> = {
  PAID: ["research_plan", "source_fetch", "research_synthesis", "write", "review"],
  RESEARCHING: ["research_synthesis", "write", "review"],
  WRITING: ["write", "review"],
  REVIEWING: ["review"],
  PUBLISHING: ["publish", "mobile_check"],
  PUBLISHED: ["mobile_check"],
};
const TITLE: Partial<Record<JobStage, string>> = {
  PAID: "Starting research…",
  RESEARCHING: "Researching your argument…",
  WRITING: "Generating your article…",
  REVIEWING: "Checking every claim…",
  PUBLISHING: "Publishing your article…",
  PUBLISHED: "Checking it on a real phone…",
};

/**
 * Animated "working" panel with an honest estimate: the remaining steps'
 * typical durations, learned from this deployment's own completed runs.
 */
export function GeneratingPanel({ stage, now, history, running }: { stage: JobStage; now: string | null; history: Record<string, number>; running: Pick<Dispatch, "kind" | "startedAt"> | null }) {
  const steps = REMAINING[stage];
  if (!steps) return null;
  let secs = steps.reduce((a, k) => a + (history[k] ?? DEFAULT[k]), 0);
  if (running?.startedAt) secs -= Math.min((nowMs() - running.startedAt.getTime()) / 1000, (history[running.kind] ?? DEFAULT[running.kind]) * 0.9);
  const mins = Math.max(1, Math.round(secs / 60));
  return (
    <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-panel p-6 md:p-8" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute inset-0 animate-[shimmer_2.4s_linear_infinite] bg-[linear-gradient(110deg,transparent_25%,rgba(255,90,31,0.10)_50%,transparent_75%)] bg-[length:200%_100%]" />
      <div className="relative flex items-start gap-4">
        <span className="relative mt-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-3 rounded-full bg-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold tracking-[-0.03em] text-fg md:text-2xl">{TITLE[stage]}</p>
          {now ? <p className="mt-1.5 text-sm text-fg-2">{now}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-fg">
              About <span className="font-semibold text-accent-ink">{mins} min</span> left
            </span>
            <span className="text-muted">You can close this page — we&apos;ll email you when it needs you.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

