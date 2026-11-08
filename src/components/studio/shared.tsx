import type { CSSProperties, ReactNode } from "react";
import { startDemoWorkspace } from "@/app/actions";
import { Button, ButtonLink, MonoLabel, cn } from "@/components/ui";
import { demoEnabled } from "@/lib/studio/session";

export function SignedOut() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line bg-panel p-8 text-center md:p-10">
      <MonoLabel className="mb-4">Studio</MonoLabel>
      <h1 className="h2 text-fg">Sign in to your Studio</h1>
      <p className="mt-3 text-sm text-muted">Your brand, voice, knowledge base and the desk working on your articles, all in one place.</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/signin">Sign in</ButtonLink>
        {demoEnabled() ? (
          <form action={startDemoWorkspace}>
            <Button type="submit" variant="secondary">Open the demo workspace</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function PageHead({ label, title, lede, children }: { label: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="max-w-2xl">
        <MonoLabel className="mb-3">{label}</MonoLabel>
        <h1 className="h2 text-fg">{title}</h1>
        {lede ? <p className="mt-2 text-sm text-muted">{lede}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Card({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-panel p-5 md:p-6", className)}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ProgressRing({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="lv-ring"
          style={{ "--c": c } as CSSProperties}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-fg">{Math.round(pct * 100)}%</span>
    </div>
  );
}

export function StatBar({ label, value, max, display, hint, delay = 0 }: { label: string; value: number; max: number; display: string; hint?: string; delay?: number }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg-2">{label}</span>
        <span className="tabular-nums text-fg">{display}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="lv-grow-x h-full rounded-full bg-accent" style={{ width: `${pct}%`, "--d": `${delay}ms` } as CSSProperties} />
      </div>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export const Skeleton = () => <div className="h-72 rounded-2xl bg-white/[0.03]" aria-busy />;

export function timeAgo(d: Date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
