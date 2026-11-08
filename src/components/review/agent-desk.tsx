import { BadgeCheck, FileSearch, PenLine, ScanSearch, Sparkles } from "lucide-react";
import type { AgentRun } from "@/lib/db/schema";
import { AGENT_TEAM } from "@/lib/studio/presets";
import { LocalTime } from "@/components/local-time";

const ICON = { researcher: FileSearch, writer: PenLine, editor: Sparkles, fact_checker: ScanSearch, reviewer: BadgeCheck } as const;
const COLOR = { researcher: "text-green", writer: "text-[#8db4ff]", editor: "text-accent-ink", fact_checker: "text-amber", reviewer: "text-fg" } as const;

/** The orchestration log: which agent on the desk did what, in order. */
export function AgentDesk({ runs }: { runs: AgentRun[] }) {
  if (!runs.length) return null;
  const name = (role: AgentRun["role"]) => AGENT_TEAM.find((a) => a.role === role)?.name ?? role;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-white/10">
      {runs.map((r) => {
        const Icon = ICON[r.role] ?? Sparkles;
        return (
          <li key={r.id} className="relative flex gap-3">
            <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-panel-2 ring-1 ring-white/10">
              <Icon className={`size-3.5 ${COLOR[r.role] ?? "text-fg"}`} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {name(r.role)}
                {r.simulated ? <span className="ml-1.5 text-subtle">· simulated</span> : null}
                <span className="float-right text-subtle tabular-nums">
                  <LocalTime iso={r.createdAt.toISOString()} />
                </span>
              </p>
              <p className="mt-0.5 text-sm text-fg">{r.action}</p>
              {r.detail.length ? (
                <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted">
                  {r.detail.slice(0, 4).map((d, i) => (
                    <li key={i} className="truncate" title={d}>
                      {d}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
