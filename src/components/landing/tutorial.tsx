"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "../ui";
import { useInView, useReducedMotion } from "./hooks";
import { vars } from "./mock";
import { ApprovePanel, CheckPanel, EditPanel, InsightsPanel, NotesPanel, PublishPanel, ResearchPanel, ScorePanel, VoicePanel } from "./tutorial-panels";

type Step = { id: string; short: string; title: string; body: string; ms: number; panel: ReactNode };

const STEPS: Step[] = [
  {
    id: "notes",
    short: "Notes in",
    title: "Notes come in by email",
    body: "Dana sends rough notes, a pilot report and two links. The desk reads the topic, the audience and one boundary: keep customer names private.",
    ms: 6000,
    panel: <NotesPanel />,
  },
  {
    id: "voice",
    short: "Voice",
    title: "Voice and knowledge load",
    body: "Brand Voice and the Knowledge Base attach to the order, so the draft starts from how Dana writes and what Northwind has already said.",
    ms: 6500,
    panel: <VoicePanel />,
  },
  {
    id: "research",
    short: "Research",
    title: "Agents research",
    body: "The Researcher searches and fetches within a fixed budget. A source is kept only when a real passage supports a claim.",
    ms: 6500,
    panel: <ResearchPanel />,
  },
  {
    id: "check",
    short: "Fact-check",
    title: "The fact-checker catches 80% vs 60%",
    body: "The notes say 80%. The pilot report says 60%. The desk asks Dana one question by email and writes her answer into the draft.",
    ms: 8000,
    panel: <CheckPanel />,
  },
  {
    id: "edit",
    short: "Edit",
    title: "Highlight and ask",
    body: "Dana selects a paragraph and types what she wants. The new version goes back through fact-check before she can approve it.",
    ms: 8500,
    panel: <EditPanel />,
  },
  {
    id: "score",
    short: "Score",
    title: "Every draft gets a quality score",
    body: "Accuracy, sources, originality, voice match, readability and search, with one overall score and a note on what would raise it.",
    ms: 6000,
    panel: <ScorePanel />,
  },
  {
    id: "approve",
    short: "Approve",
    title: "Approve the exact version",
    body: "Approval is bound to v3 and its SHA-256 content hash. If one word changes, the approval no longer counts.",
    ms: 6500,
    panel: <ApprovePanel />,
  },
  {
    id: "publish",
    short: "Publish",
    title: "Publish everywhere, then verify",
    body: "The article goes live, is fetched back and opened on a real phone. The newsletter, X thread and LinkedIn post come from the same approved article.",
    ms: 6500,
    panel: <PublishPanel />,
  },
  {
    id: "insights",
    short: "Insights",
    title: "Insights suggest what is next",
    body: "Reads come back, the Refresh analyst flags an older post, and the desk suggests the next topic from what readers spent time on.",
    ms: 7000,
    panel: <InsightsPanel />,
  },
];

const N = STEPS.length;

export function Tutorial() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [userDriven, setUserDriven] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const inView = useInView(root);
  const reduced = useReducedMotion();

  const autoplay = !reduced && !userPaused;
  const running = autoplay && inView && !hovered && !focused;
  const step = STEPS[active];

  function go(i: number, focusTab = false) {
    const next = (i + N) % N;
    setActive(next);
    setUserDriven(true);
    if (focusTab) tabs.current[next]?.focus();
  }

  // Keep the active step visible in the horizontal rail on small screens.
  useEffect(() => {
    const r = rail.current;
    const t = tabs.current[active];
    if (!r || !t || r.scrollWidth <= r.clientWidth) return;
    r.scrollTo({ left: t.offsetLeft - r.clientWidth / 2 + t.offsetWidth / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const onTab = (e.target as HTMLElement).getAttribute("role") === "tab";
    const keys: Record<string, number | undefined> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      ArrowDown: onTab ? active + 1 : undefined,
      ArrowUp: onTab ? active - 1 : undefined,
      Home: onTab ? 0 : undefined,
      End: onTab ? N - 1 : undefined,
    };
    const target = keys[e.key];
    if (target === undefined) return;
    e.preventDefault();
    go(target, onTab);
  }

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className="grid gap-5 lg:grid-cols-[280px_1fr] lg:gap-8"
    >
      {/* Step rail */}
      <div ref={rail} role="tablist" aria-label="Steps in the tour" className="lv-rail lv-fade-edges relative -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
        {STEPS.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`tour-tab-${s.id}`}
              aria-selected={on}
              aria-controls={`tour-panel-${s.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => go(i)}
              className={cn(
                "group relative shrink-0 overflow-hidden lg:overflow-visible rounded-lg border text-left transition-colors lg:rounded-none lg:border-0 lg:border-l-2",
                "px-3 py-2 lg:px-4 lg:py-2.5",
                on ? "border-accent/40 bg-accent-tint lg:border-l-accent/25 lg:bg-white/[0.03]" : "border-line hover:bg-white/[0.03] lg:border-l-line",
              )}
            >
              <span className="flex items-baseline gap-2.5">
                <span className={cn("font-mono text-[11px]", on ? "text-accent-ink" : i < active ? "text-fg-2" : "text-subtle")}>{String(i + 1).padStart(2, "0")}</span>
                <span className={cn("whitespace-nowrap text-sm lg:whitespace-normal", on ? "text-fg" : "text-muted group-hover:text-fg-2")}>
                  <span className="lg:hidden">{s.short}</span>
                  <span className="hidden lg:inline">{s.title}</span>
                </span>
              </span>
              {on ? (
                <span key={`body-${active}`} className="lv-fade hidden pt-1.5 pl-[30px] text-[13px] leading-relaxed text-muted lg:block">
                  {s.body}
                </span>
              ) : null}
              {/* Progress */}
              <span aria-hidden className="absolute right-0 bottom-0 left-0 h-0.5 lg:top-0 lg:right-auto lg:-left-0.5 lg:h-auto lg:w-0.5">
                {on && autoplay
                  ? (["lv-progress block lg:hidden", "lv-progress-y hidden lg:block"] as const).map((c) => (
                      <span
                        key={`${c}-${active}`}
                        onAnimationEnd={(e) => {
                          if (e.target === e.currentTarget) setActive((a) => (a + 1) % N);
                        }}
                        className={cn(c, "size-full bg-accent")}
                        style={vars({ "--dur": `${s.ms}ms`, animationPlayState: running ? "running" : "paused" })}
                      />
                    ))
                  : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="min-w-0">
        <div className="mb-4 lg:hidden">
          <p className="text-base font-medium text-fg">{step.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
        </div>
        <div className="lv-stack">
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <div
                key={s.id}
                role="tabpanel"
                id={`tour-panel-${s.id}`}
                aria-labelledby={`tour-tab-${s.id}`}
                aria-hidden={!on}
                inert={!on}
                className={cn("lv-panel", on ? "is-active" : "lv-gate")}
              >
                {s.panel}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => go(active - 1)} aria-label="Previous step" className="flex size-9 items-center justify-center border border-line-strong text-fg-2 transition-colors hover:bg-white/5 hover:text-fg">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          {reduced ? null : (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Play the tour" : "Pause the tour"}
              className="flex size-9 items-center justify-center border border-line-strong text-fg-2 transition-colors hover:bg-white/5 hover:text-fg"
            >
              {userPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            </button>
          )}
          <button type="button" onClick={() => go(active + 1)} aria-label="Next step" className="flex size-9 items-center justify-center border border-line-strong text-fg-2 transition-colors hover:bg-white/5 hover:text-fg">
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <p aria-live={userDriven ? "polite" : "off"} className="ml-2 min-w-0 truncate text-sm text-muted">
            <span className="font-mono text-fg-2">
              {active + 1}/{N}
            </span>{" "}
            <span className="sr-only">{step.title}</span>
            <span aria-hidden className="hidden sm:inline">
              {running ? "Playing. Hover to pause." : autoplay ? "Paused" : "Use the arrow keys or the steps"}
            </span>
          </p>
          <p className="ml-auto hidden text-xs text-subtle md:block">Example order. Figures are illustrative.</p>
        </div>
      </div>
    </div>
  );
}
