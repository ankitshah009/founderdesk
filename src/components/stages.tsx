import { Check } from "lucide-react";
import type { JobStage } from "@/lib/db/schema";
import { Chip, cn } from "./ui";

export const STAGE_LABEL: Record<JobStage, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  RESEARCHING: "Researching",
  WRITING: "Writing",
  REVIEWING: "Reviewing",
  WAITING_FOR_FOUNDER: "Waiting for you",
  READY_FOR_APPROVAL: "Ready for your approval",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  COMPLETE: "Complete",
  UNABLE_TO_COMPLETE: "Needs attention",
};

const tone = (s: JobStage) =>
  s === "COMPLETE" || s === "PUBLISHED"
    ? "green"
    : s === "WAITING_FOR_FOUNDER" || s === "READY_FOR_APPROVAL"
      ? "accent"
      : s === "UNABLE_TO_COMPLETE"
        ? "red"
        : s === "AWAITING_PAYMENT"
          ? "neutral"
          : "blue";

export function StageChip({ stage }: { stage: JobStage }) {
  return <Chip tone={tone(stage)}>{STAGE_LABEL[stage]}</Chip>;
}

export const IN_PROGRESS: JobStage[] = ["PAID", "RESEARCHING", "WRITING", "REVIEWING", "PUBLISHING", "PUBLISHED"];

type Step = { key: string; title: string; detail: string; stages: JobStage[] };

const STEPS: Step[] = [
  { key: "brief", title: "Brief received", detail: "Your notes, links and boundaries are on file.", stages: ["AWAITING_PAYMENT"] },
  { key: "paid", title: "Payment", detail: "Paying starts research automatically.", stages: ["PAID"] },
  { key: "research", title: "Research", detail: "Sources searched, fetched and checked for usable passages.", stages: ["RESEARCHING"] },
  { key: "write", title: "Writing & review", detail: "Drafted in your voice, then checked claim by claim against the sources.", stages: ["WRITING", "REVIEWING", "WAITING_FOR_FOUNDER"] },
  { key: "approve", title: "Your approval", detail: "You approve the exact text on a private page.", stages: ["READY_FOR_APPROVAL"] },
  { key: "publish", title: "Published & verified", detail: "We fetch the live page to confirm the approved version is served.", stages: ["PUBLISHING", "PUBLISHED"] },
  { key: "phone", title: "Phone check", detail: "The live article is opened on a phone and checked for layout problems.", stages: ["COMPLETE"] },
];

const ORDER: JobStage[] = ["AWAITING_PAYMENT", "PAID", "RESEARCHING", "WRITING", "REVIEWING", "WAITING_FOR_FOUNDER", "READY_FOR_APPROVAL", "PUBLISHING", "PUBLISHED", "COMPLETE"];

/** Vertical order timeline: done ✓ · current ● · upcoming ○. */
export function Timeline({ stage }: { stage: JobStage }) {
  const at = ORDER.indexOf(stage === "UNABLE_TO_COMPLETE" ? "REVIEWING" : stage);
  const currentIdx = STEPS.findIndex((s) => s.stages.includes(stage));
  return (
    <ol className="relative">
      {STEPS.map((s, i) => {
        const lastStageIdx = Math.max(...s.stages.map((x) => ORDER.indexOf(x)));
        const done = stage === "COMPLETE" ? true : i < currentIdx || (currentIdx === -1 && lastStageIdx < at);
        const current = i === currentIdx && stage !== "COMPLETE";
        const waiting = current && (stage === "WAITING_FOR_FOUNDER" || stage === "READY_FOR_APPROVAL" || stage === "AWAITING_PAYMENT");
        return (
          <li key={s.key} className="relative flex gap-4 pb-7 last:pb-0">
            {i < STEPS.length - 1 ? (
              <span aria-hidden className={cn("absolute left-[11px] top-6 bottom-0 w-px", done ? "bg-green/50" : "border-l border-dashed border-white/15")} />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                done ? "bg-green/15 text-green ring-1 ring-green/40" : current ? (waiting ? "bg-accent-tint ring-1 ring-accent/50" : "bg-blue/15 ring-1 ring-blue/50") : "ring-1 ring-white/15",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : current ? <span className={cn("size-2 rounded-full pulse-dot", waiting ? "bg-accent" : "bg-blue")} /> : null}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm", done || current ? "text-fg" : "text-muted")}>
                {s.title}
                {current ? <span className="sr-only"> (current step)</span> : null}
              </p>
              <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
