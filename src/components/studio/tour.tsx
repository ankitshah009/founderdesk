"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X, PlayCircle } from "lucide-react";
import { cn } from "@/components/ui";

const DONE_KEY = "fd_studio_tour_v1";

export type TourStep = { title: string; body: string; target: string; href: string; cta: string; done: boolean };

/**
 * The five-step guided tour of the Studio. It spotlights the sidebar item for
 * each step, says what it does in a sentence, and offers to do it now. Opens
 * on the first visit (until finished or skipped); "Take the tour" replays it.
 */
export function StudioTour({ steps, autoStart, onSeen }: { steps: TourStep[]; autoStart: boolean; onSeen?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const start = () => {
      setI(Math.max(0, steps.findIndex((s) => !s.done)));
      setOpen(true);
    };
    window.addEventListener("fd:tour", start);
    let t: ReturnType<typeof setTimeout> | undefined;
    // First visit after signing in or up: the account hasn't seen it yet (stored server-side).
    if (autoStart) t = setTimeout(start, 600);
    return () => {
      window.removeEventListener("fd:tour", start);
      clearTimeout(t);
    };
  }, [autoStart, steps]);

  const step = steps[i];
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return setRect(null);
    el.scrollIntoView({ block: "nearest", inline: "center" });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // Streaming content shifts the layout after the first frame: follow it.
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    const late = [setTimeout(measure, 300), setTimeout(measure, 1000)];
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
      late.forEach(clearTimeout);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {}
    setOpen(false);
    void onSeen?.();
  }, [onSeen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !step) return null;
  const pad = 6;
  const cardTop = rect ? Math.min(window.innerHeight - 260, Math.max(16, rect.top - 8)) : window.innerHeight / 2 - 120;
  const cardLeft = rect ? (rect.right + 16 + 340 < window.innerWidth ? rect.right + 16 : Math.max(16, Math.min(window.innerWidth - 356, rect.left))) : window.innerWidth / 2 - 170;
  const cardTopFinal = rect && rect.right + 16 + 340 >= window.innerWidth ? Math.min(window.innerHeight - 260, rect.bottom + 12) : cardTop;

  // Portal to <body>: a parent with a filter or backdrop blur would otherwise
  // become the containing block for these fixed elements and offset them.
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          aria-hidden
          className="tour-spot pointer-events-none fixed rounded-lg transition-all duration-300"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px #ff6b3d" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/60" />
      )}
      <button aria-label="Close tour" onClick={close} className="fixed inset-0 cursor-default" tabIndex={-1} />
      <div className="fixed w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line-strong bg-elev p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] transition-all duration-300" style={{ top: cardTopFinal, left: cardLeft }}>
        <div className="flex items-center justify-between">
          <p className="mono-label">
            Step {i + 1} of {steps.length}
            {step.done ? <span className="ml-2 text-green">✓ done</span> : null}
          </p>
          <button onClick={close} className="text-subtle hover:text-fg" aria-label="Skip the tour">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-2 text-lg font-semibold tracking-[-0.01em] text-fg">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{step.body}</p>
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {steps.map((s, k) => (
            <span key={k} className={cn("h-1 flex-1 rounded-full transition-colors", k === i ? "bg-accent" : s.done ? "bg-accent/40" : "bg-white/10")} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-30">
            <ArrowLeft className="size-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Link href={step.href} onClick={close} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-[#140a05] hover:bg-[#ff7a4d]">
              {step.done ? "Open" : step.cta}
            </Link>
            {i < steps.length - 1 ? (
              <button onClick={() => setI((x) => x + 1)} className="inline-flex items-center gap-1 rounded-lg bg-white/8 px-3 py-1.5 text-xs text-fg hover:bg-white/12">
                Next <ArrowRight className="size-3.5" />
              </button>
            ) : (
              <button onClick={close} className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-fg hover:bg-white/12">
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TutorialButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("fd:tour"))}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-fg-2 hover:border-white/25 hover:text-fg", className)}
    >
      <PlayCircle className="size-4" aria-hidden /> Tutorial
    </button>
  );
}
