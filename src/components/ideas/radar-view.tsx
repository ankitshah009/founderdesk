import { ExternalLink, HelpCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Radar } from "@/lib/studio/ideas";
import { Chip, cn } from "@/components/ui";

const STATUS = {
  rising: { label: "Rising", tone: "green", Icon: TrendingUp, line: "Interest is building. Post soon." },
  steady: { label: "Steady", tone: "blue", Icon: Minus, line: "Evergreen for now. No rush, no penalty." },
  cooling: { label: "Cooling", tone: "amber", Icon: TrendingDown, line: "The conversation is fading. Add a fresh angle." },
  unknown: { label: "Unknown", tone: "neutral", Icon: HelpCircle, line: "Not enough dated signals to call it." },
} as const;

/** Trend Timing Radar result. Pure render: safe in server and client components. */
export function RadarView({ radar }: { radar: Radar }) {
  const s = STATUS[radar.status];
  const blips = radar.signals.slice(0, 6);
  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-[180px] overflow-hidden rounded-full border border-line" aria-hidden>
          <div className="absolute inset-[22%] rounded-full border border-line" />
          <div className="absolute inset-[42%] rounded-full border border-line" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.06]" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
          <div className="lv-sweep absolute inset-0">
            <div className="absolute top-0 left-1/2 h-1/2 w-px origin-bottom bg-accent/70" />
          </div>
          {blips.map((b, i) => {
            const a = (i / Math.max(1, blips.length)) * Math.PI * 2 + 0.6;
            const d = 18 + ((i * 37) % 26);
            return (
              <span
                key={b.url ?? i}
                className="lv-pop absolute size-2 rounded-full bg-accent"
                style={{ left: `calc(50% + ${Math.cos(a) * d}% - 4px)`, top: `calc(50% + ${Math.sin(a) * d}% - 4px)`, ["--d" as string]: `${300 + i * 140}ms` }}
              />
            );
          })}
          <div className={cn("absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full border bg-panel", radar.status === "rising" ? "border-green/40 text-green" : radar.status === "cooling" ? "border-amber/40 text-amber" : "border-line-strong text-fg-2")}>
            <s.Icon className="size-6" />
          </div>
        </div>
        <Chip tone={s.tone}>{s.label}</Chip>
      </div>
      <div className="min-w-0 space-y-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.02em] text-fg">{s.line}</p>
          <ul className="mt-3 space-y-1.5 text-sm text-fg-2">
            {radar.evidence.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-panel-2 p-4">
          <p className="mono-label">Best time to post</p>
          <p className="mt-2 text-sm text-fg">{radar.bestTime.label}</p>
          {!radar.bestTime.fromData ? <p className="mt-1 text-xs text-amber">General guidance, not learned from your posts.</p> : <p className="mt-1 text-xs text-green">Learned from your own post history.</p>}
        </div>
        {radar.signals.length ? (
          <div>
            <p className="mono-label">Signals</p>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {radar.signals.map((sig, i) => (
                <li key={(sig.url ?? "") + i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-fg">{sig.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {sig.source}
                      {sig.date ? ` · ${new Date(sig.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : " · undated"}
                    </p>
                  </div>
                  {sig.url ? (
                    <a href={sig.url} target="_blank" rel="noreferrer noopener" className="shrink-0 text-muted hover:text-fg" aria-label="Open source">
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
