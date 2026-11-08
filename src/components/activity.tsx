import { nowMs } from "@/lib/clock";
import { Check, Clock, Loader2, X } from "lucide-react";
import type { Dispatch, Job, Source } from "@/lib/db/schema";
import { cn } from "./ui";

/**
 * Plain-language, live activity feed for an order — what the agents are doing
 * right now, what finished, and what (or who) the order is waiting on.
 */

type Item = { key: string; at: Date; label: string; detail?: string; state: "done" | "running" | "queued" | "failed" | "waiting" | "info" };

const host = (u: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : null;
  } catch {
    return u;
  }
};

function describe(d: Dispatch, sources: Map<string, Source>): { label: string; detail?: string } {
  const i = d.input as Record<string, unknown>;
  switch (d.kind) {
    case "research_plan":
      return { label: "Planning the research" };
    case "source_search":
      return { label: `Searching the web for “${String(i.query ?? "")}”` };
    case "source_fetch": {
      const s = sources.get(String(i.sourceId));
      const name = s?.title ?? host(s?.url ?? null) ?? "a source";
      const detail = s?.status === "empty" ? "No usable text — not cited" : s?.status === "failed" ? "Couldn't be read" : s?.content ? `${Math.round(s.content.length / 6).toLocaleString()} words` : undefined;
      return { label: `Reading ${name}`, detail };
    }
    case "research_synthesis":
      return { label: "Pulling exact quotes from the sources" };
    case "write":
      return { label: Number(i.version) > 1 ? `Revising the draft (version ${i.version})` : "Writing the draft" };
    case "review":
      return { label: "Checking every claim against its source" };
    case "publish":
      return { label: i.destination === "web" ? "Publishing and verifying the live page" : `Posting to ${String(i.destination).toUpperCase()}` };
    case "mobile_check":
      return { label: "Checking the article on a real phone" };
  }
}

const fmtDur = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function ActivityFeed({ job, dispatches, sources, waitMinutes }: { job: Job; dispatches: Dispatch[]; sources: Source[]; waitMinutes: number }) {
  const now = nowMs();
  const byId = new Map(sources.map((s) => [s.id, s]));
  const items: Item[] = [{ key: "created", at: job.createdAt, label: "Brief received", state: "done" }];
  if (job.paidAt) items.push({ key: "paid", at: job.paidAt, label: job.amountCents === 0 ? "Free article confirmed" : "Payment received", state: "done" });

  for (const d of dispatches) {
    const { label, detail } = describe(d, byId);
    const started = d.startedAt ?? d.createdAt;
    const state: Item["state"] = d.status === "succeeded" ? "done" : d.status === "failed" ? "failed" : d.status === "started" || d.startedAt ? "running" : "queued";
    const timing =
      state === "done" && d.finishedAt
        ? fmtDur(d.finishedAt.getTime() - started.getTime())
        : state === "running"
          ? `running for ${fmtDur(now - started.getTime())}`
          : state === "queued"
            ? "up next"
            : undefined;
    items.push({ key: d.id, at: started, label, detail: [detail, timing].filter(Boolean).join(" · ") || undefined, state });
  }
  for (const [i, r] of job.founderReplies.entries()) {
    const auto = r.text.startsWith("No answer received in time");
    items.push({ key: `reply-${i}`, at: new Date(r.receivedAt), label: auto ? "No answer yet — continued with the safe choice" : "Your reply received", state: "info" });
  }
  if (job.stage === "WAITING_FOR_FOUNDER") {
    const resumeAt = new Date(job.updatedAt.getTime() + waitMinutes * 60_000);
    items.push({ key: "waiting", at: job.updatedAt, label: "Waiting for your answer", detail: `Reply to our email — or we continue automatically at ${fmtTime(resumeAt)}`, state: "waiting" });
  }
  if (job.stage === "READY_FOR_APPROVAL") items.push({ key: "approve", at: job.updatedAt, label: "Ready for your approval", state: "waiting" });

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const icon = (s: Item["state"]) =>
    s === "done" ? (
      <Check className="size-3.5 text-green" aria-hidden />
    ) : s === "running" ? (
      <Loader2 className="size-3.5 animate-spin text-accent-ink" aria-hidden />
    ) : s === "failed" ? (
      <X className="size-3.5 text-red" aria-hidden />
    ) : s === "waiting" ? (
      <Clock className="size-3.5 text-amber" aria-hidden />
    ) : (
      <span className="size-1.5 rounded-full bg-white/40" aria-hidden />
    );

  return (
    <ol className="space-y-0.5" aria-live="polite">
      {items.map((it) => (
        <li key={it.key} className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5", (it.state === "running" || it.state === "waiting") && "bg-white/[0.04]")}>
          <span className="mt-1 flex size-4 shrink-0 items-center justify-center">{icon(it.state)}</span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", it.state === "queued" ? "text-muted" : "text-fg")}>{it.label}</p>
            {it.detail ? <p className="mt-0.5 text-xs text-muted">{it.detail}</p> : null}
          </div>
          <span className="shrink-0 text-xs text-subtle tabular-nums">{fmtTime(it.at)}</span>
        </li>
      ))}
    </ol>
  );
}

/** One-line "now" summary for compact surfaces (Your orders). */
export function currentActivity(job: Job, dispatches: Dispatch[], sources: Source[]): string | null {
  const live = dispatches.filter((d) => d.status === "started" || d.status === "pending");
  if (!live.length) return null;
  const byId = new Map(sources.map((s) => [s.id, s]));
  return describe(live[0]!, byId).label;
}
