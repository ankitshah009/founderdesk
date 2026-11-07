import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-white text-[#222] hover:bg-[#e8e8e8]",
  secondary: "bg-[#2a2a2a] text-fg hover:bg-[#333]",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/5",
  danger: "bg-red/15 text-red hover:bg-red/25",
};

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium tracking-[0.0075em] transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}

type Tone = "neutral" | "accent" | "green" | "amber" | "red" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-white/6 text-fg-2 ring-white/10",
  accent: "bg-accent-tint text-accent-ink ring-accent/25",
  green: "bg-green/12 text-green ring-green/25",
  amber: "bg-amber/12 text-amber ring-amber/25",
  red: "bg-red/12 text-red ring-red/25",
  blue: "bg-blue/12 text-[#8db4ff] ring-blue/25",
};

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color = { neutral: "bg-muted", accent: "bg-accent", green: "bg-green", amber: "bg-amber", red: "bg-red", blue: "bg-blue" }[tone];
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", color, pulse && "pulse-dot")} />;
}

export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mono-label", className)}>{children}</p>;
}

export function SectionHead({ label, title, lede, className }: { label?: string; title: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-xl", className)}>
      {label ? <MonoLabel className="mb-5">{label}</MonoLabel> : null}
      <h2 className="h1 text-fg">{title}</h2>
      {lede ? <p className="lede mt-4 max-w-md">{lede}</p> : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-fg-2">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none transition focus:border-line-strong focus:bg-elev";
