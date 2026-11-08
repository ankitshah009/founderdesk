import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";

/** Small, dependency-free charts for the Idea Lab. Animations use the lv-* classes, which honour reduced motion. */

const ord = (n: number) => {
  const r = Math.round(n);
  const s = r % 100 >= 11 && r % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[r % 10] ?? "th";
  return `${r}${s}`;
};
export { ord };

export function toneFor(p: number): "green" | "amber" | "red" {
  return p >= 65 ? "green" : p >= 40 ? "amber" : "red";
}
const stroke = { green: "var(--green)", amber: "var(--amber)", red: "var(--red)", accent: "var(--accent)" } as const;

/** A ring gauge with an optional range arc. */
export function RingGauge({ value, range, size = 168, label, sub }: { value: number; range?: [number, number]; size?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const tone = toneFor(v);
  const [lo, hi] = range ?? [v, v];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="10" />
        {range ? (
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="rgb(255 255 255 / 0.16)"
            strokeWidth="10"
            strokeDasharray={`${(c * (hi - lo)) / 100} ${c}`}
            strokeDashoffset={(-c * lo) / 100}
            className="lv-fade"
          />
        ) : null}
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={stroke[tone]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className="lv-ring"
          style={{ "--c": c } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-semibold tracking-[-0.04em] text-fg tabular-nums">{label ?? Math.round(v)}</span>
        {sub ? <span className="mt-1 text-[11px] text-muted">{sub}</span> : null}
      </div>
    </div>
  );
}

/** A 0–100 track with an optional band and a marker. */
export function Track({ value, band, tone, className, delay = 0 }: { value: number; band?: [number, number]; tone?: "green" | "amber" | "red" | "accent"; className?: string; delay?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? toneFor(v);
  return (
    <div className={cn("relative h-1.5 rounded-full bg-white/[0.07]", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      {band ? <div className="absolute inset-y-0 rounded-full bg-white/15" style={{ left: `${band[0]}%`, width: `${Math.max(1, band[1] - band[0])}%` }} /> : null}
      <div className="lv-grow-x absolute inset-y-0 left-0 rounded-full" style={{ width: `${v}%`, background: stroke[t], "--d": `${delay}ms` } as CSSProperties} />
    </div>
  );
}

/** Percentile badge: "72nd pct" coloured by tier. */
export function Pct({ value, className }: { value: number; className?: string }) {
  const t = toneFor(value);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset",
        t === "green" ? "bg-green/12 text-green ring-green/25" : t === "amber" ? "bg-amber/12 text-amber ring-amber/25" : "bg-red/12 text-red ring-red/25",
        className,
      )}
    >
      {ord(value)} pct
    </span>
  );
}

export function Panel({ n, title, kicker, lede, children, aside, id }: { n: string; title: string; kicker?: ReactNode; lede?: ReactNode; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section id={id} className="lv-rise scroll-mt-24 rounded-3xl border border-line bg-panel p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="mono-label">
            {n} · {title}
          </p>
          {kicker ? <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-fg">{kicker}</h2> : null}
          {lede ? <p className="mt-2 text-sm text-muted">{lede}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function excerpt(text: string, n = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
