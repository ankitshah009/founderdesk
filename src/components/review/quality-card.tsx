import type { QualityScores } from "@/lib/db/schema";
import { QUALITY_LABELS } from "@/lib/studio/quality";
import { cn } from "@/components/ui";

const tone = (n: number) => (n >= 80 ? "bg-green" : n >= 60 ? "bg-amber" : "bg-red");
const text = (n: number) => (n >= 80 ? "text-green" : n >= 60 ? "text-amber" : "text-red");

/** Quality score of a reviewed draft: overall ring, six components, and what would raise it. */
export function QualityCard({ scores, compact = false }: { scores: QualityScores; compact?: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 72 72" className="size-[72px] shrink-0 -rotate-90" aria-hidden>
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - scores.overall / 100)}
            className={cn("quality-ring", text(scores.overall))}
          />
        </svg>
        <div>
          <p className="text-xs text-muted">Quality score</p>
          <p className="text-3xl font-medium tracking-[-0.03em] text-fg">
            {scores.overall}
            <span className="text-base text-subtle">/100</span>
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2.5">
        {QUALITY_LABELS.map(({ key, label, hint }) => {
          const v = scores[key];
          return (
            <li key={key} title={hint}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-2">{label}</span>
                <span className={cn("tabular-nums", v == null ? "text-subtle" : text(v))}>{v == null ? "add samples" : v}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                {v != null ? <div className={cn("quality-bar h-full rounded-full", tone(v))} style={{ width: `${v}%` }} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!compact && scores.suggestions.length ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs text-muted">To raise it</p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-fg-2">
            {scores.suggestions.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
