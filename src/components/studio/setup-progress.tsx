import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/components/ui";
import { nextStep, type SetupStep } from "@/lib/studio/setup";

/**
 * Setup progress on every setup page: finished steps are checked and struck
 * through, and the next step is one click away. Saving on a page refreshes it,
 * so the strip updates the moment a step is done.
 */
export function SetupProgress({ steps, current }: { steps: SetupStep[]; current?: SetupStep["key"][] }) {
  const next = nextStep(steps);
  const done = steps.filter((s) => s.done).length;
  if (!next) {
    return (
      <section aria-label="Setup progress" className="mb-8 flex items-center gap-2 rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-sm text-green">
        <Check className="size-4" strokeWidth={3} aria-hidden /> All set: {steps.length} of {steps.length} done. Every new draft uses your brand, voice and readers.
      </section>
    );
  }
  const hereDone = current?.length ? steps.filter((s) => current.includes(s.key)).every((s) => s.done) : false;
  return (
    <section aria-label="Setup progress" className="mb-8 rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Get set up · <span className="tabular-nums text-fg-2">{done} of {steps.length}</span> done
          {hereDone ? <span className="ml-2 text-green">✓ This page is done</span> : null}
        </p>
        <Link href={next.href} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-[#140a05] hover:bg-[#ff7a4d]">
          Next: {next.label} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1.5">
        {steps.map((s) => (
          <li key={s.key} className="min-w-0">
            <div className={cn("h-1 rounded-full", s.done ? "bg-accent" : s.key === next.key ? "bg-accent/40" : "bg-white/10")} />
            <Link href={s.href} className={cn("mt-1.5 flex items-center gap-1 truncate text-[11px]", s.done ? "text-muted line-through decoration-white/25" : s.key === next.key ? "text-fg" : "text-subtle hover:text-fg-2")}>
              {s.done ? <Check className="size-3 shrink-0 text-accent" strokeWidth={3} aria-hidden /> : null}
              <span className="truncate">{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
