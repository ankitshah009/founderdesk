import type { CSSProperties, ReactNode } from "react";
import { cn } from "../ui";

/** Inline style helper for CSS custom properties such as --d (delay). */
export function vars(o: Record<string, string | number>): CSSProperties {
  return o as CSSProperties;
}

/** Delay helper: `delay(120)` → style with --d: 120ms. */
export function delay(ms: number, extra?: Record<string, string | number>): CSSProperties {
  return vars({ "--d": `${ms}ms`, ...extra });
}

/** A product window: hairline chrome with a title and an optional status on the right. */
export function Window({ title, right, children, className, bodyClassName }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line-strong bg-[#0d0b0a] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="flex gap-1">
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </span>
          <span className="truncate">{title}</span>
        </span>
        {right ? <span className="shrink-0">{right}</span> : null}
      </div>
      <div className={cn("p-4 md:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

export function Cite({ children }: { children: ReactNode }) {
  return <sup className="ml-0.5 font-mono text-[10px] text-accent-ink">{children}</sup>;
}

/** A progress ring. value 0–100. Animates from empty when it first plays. */
export function Ring({ value, size = 44, stroke = 3.2, d = 0, tone = "accent", children }: { value: number; size?: number; stroke?: number; d?: number; tone?: "accent" | "green"; children?: ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        <circle
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          stroke={tone === "green" ? "var(--green)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="100 100"
          className="lv-ring"
          style={vars({ strokeDashoffset: 100 - value, "--c": 100, "--d": `${d}ms` })}
        />
      </svg>
      {children ? <span className="absolute inset-0 flex items-center justify-center">{children}</span> : null}
    </span>
  );
}

/** A horizontal meter. value 0–100. */
export function Meter({ value, d = 0, tone = "accent", className }: { value: number; d?: number; tone?: "accent" | "green" | "muted"; className?: string }) {
  const color = tone === "green" ? "bg-green" : tone === "muted" ? "bg-white/30" : "bg-accent";
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full bg-white/8", className)} aria-hidden>
      <span className={cn("lv-grow-x block h-full rounded-full", color)} style={delay(d, { width: `${value}%` })} />
    </span>
  );
}
