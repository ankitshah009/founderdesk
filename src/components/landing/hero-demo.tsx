"use client";

import { useRef } from "react";
import { Check, ClipboardCheck, Highlighter, Mail, Paperclip, PenLine, Search, ShieldCheck } from "lucide-react";
import { Chip, cn } from "../ui";
import { useCycle, useInView, useReducedMotion } from "./hooks";
import { Cite, Ring } from "./mock";

/*
 * The hero product shot: the agent desk working the Northwind example live.
 * Phases: brief in → research → write → fact-check (80% → 60%) → edit →
 * review → ready for approval. Every element keeps its space at all times
 * (only opacity and transform change), so nothing shifts while it plays.
 */

const DURATIONS = [1500, 1300, 1400, 1300, 1600, 1900, 1700, 1600, 1500, 3400] as const;
const LAST = DURATIONS.length - 1;

const AGENTS = [
  { name: "Researcher", icon: Search, work: "Reading pilot-report.pdf", done: "3 sources kept", start: 1, end: 3 },
  { name: "Writer", icon: PenLine, work: "Drafting in Dana's voice", done: "Draft v1", start: 3, end: 5 },
  { name: "Fact-checker", icon: ShieldCheck, work: "Checking 9 claims", done: "1 figure corrected", start: 5, end: 6 },
  { name: "Editor", icon: Highlighter, work: "Applying the style guide", done: "2 edits", start: 6, end: 7 },
  { name: "Reviewer", icon: ClipboardCheck, work: "Scoring the draft", done: "Quality 92", start: 7, end: 8 },
] as const;

type AgentState = "queued" | "working" | "done";
const stateOf = (a: (typeof AGENTS)[number], phase: number): AgentState => (phase < a.start ? "queued" : phase < a.end ? "working" : "done");

const STATUS = ["Brief received", "Researching", "Researching", "Writing", "Writing", "Checking facts", "Editing", "Reviewing", "Ready for your approval", "Ready for your approval"];

function show(on: boolean) {
  return cn("transition-[opacity,translate] duration-500 ease-[var(--lv-ease)]", on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5");
}

export function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [step] = useCycle(DURATIONS.length, DURATIONS, inView && !reduced);
  const phase = reduced ? LAST : step;
  const ready = phase >= 8;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Product demo: the FounderDesk agent desk researches, writes, fact-checks and scores an article about narrow support workflows. The fact-checker corrects 80% to the 60% in the pilot report, then the draft waits for the founder's approval."
      className="overflow-hidden rounded-xl border border-line-strong bg-[#0d0b0a] text-left shadow-[0_50px_140px_-40px_rgba(0,0,0,0.95)]"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="flex gap-1">
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </span>
          <span className="truncate">Studio · Northwind · Narrow support workflows</span>
        </span>
        <span key={STATUS[phase]} className="lv-fade shrink-0">
          <Chip tone={ready ? "green" : phase === 5 ? "amber" : "accent"}>
            <span className={cn("size-1.5 rounded-full", ready ? "bg-green" : phase === 5 ? "bg-amber" : "bg-accent", !ready && "pulse-dot")} />
            {STATUS[phase]}
          </Chip>
        </span>
      </div>

      <div className="grid md:grid-cols-[240px_1fr] lg:grid-cols-[250px_1fr_220px]">
        {/* Left: brief + agent desk */}
        <aside className="hidden border-r border-line p-3 md:block">
          <div className={cn("rounded-lg border border-line bg-panel-2 p-3", show(true))}>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Mail className="size-3" aria-hidden /> dana@northwind.dev
            </p>
            <p className="mt-1.5 text-[12px] leading-snug text-fg-2">
              Narrow workflows cut our response time{" "}
              <span className={cn("rounded transition-colors duration-500", phase === 5 ? "bg-amber/25 text-amber" : "text-fg")}>80%</span>. Keep customer names private.
            </p>
            <p className="mt-2 inline-flex items-center gap-1 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-fg-2">
              <Paperclip className="size-2.5" aria-hidden /> pilot-report.pdf
            </p>
          </div>
          <p className="mono-label mt-4 mb-2 px-1 text-[11px]">Agent desk</p>
          <ul className="space-y-1">
            {AGENTS.map((a) => {
              const s = stateOf(a, phase);
              const Icon = a.icon;
              return (
                <li key={a.name} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-500", s === "working" ? "bg-accent-tint" : "")}>
                  <span
                    className={cn(
                      "relative flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors duration-500",
                      s === "working" ? "lv-live border-accent/50 text-accent-ink" : s === "done" ? "border-green/30 text-green" : "border-line text-subtle",
                    )}
                  >
                    {s === "done" ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className={cn("block text-[12px]", s === "queued" ? "text-muted" : "text-fg")}>{a.name}</span>
                    <span className="block truncate text-[11px] text-subtle">{s === "queued" ? "Queued" : s === "working" ? a.work : a.done}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Middle: the draft */}
        <div className="min-w-0 p-4 md:p-6">
          {/* Mobile agent strip */}
          <ul className="mb-4 flex gap-1.5 md:hidden">
            {AGENTS.map((a) => {
              const s = stateOf(a, phase);
              const Icon = a.icon;
              return (
                <li
                  key={a.name}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md border transition-colors duration-500",
                    s === "working" ? "lv-live border-accent/50 bg-accent-tint text-accent-ink" : s === "done" ? "border-green/30 text-green" : "border-line text-subtle",
                  )}
                >
                  {s === "done" ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
                </li>
              );
            })}
            <li className="ml-auto self-center text-[11px] text-muted">{phase >= 1 && phase < 8 ? AGENTS.find((a) => stateOf(a, phase) === "working")?.name : ready ? "All agents done" : "Queued"}</li>
          </ul>

          <p className="mono-label text-[11px]">Draft {phase >= 7 ? "v2" : "v1"}</p>
          <div className="relative mt-2">
            <h3 className={cn("text-xl font-medium leading-snug tracking-[-0.02em] text-fg md:text-2xl", show(phase >= 3))}>Why founders should start with narrow support workflows</h3>
            {phase < 3 ? (
              <div className="absolute inset-x-0 top-1 space-y-2.5" aria-hidden>
                <span className="block h-4 w-11/12 animate-pulse rounded bg-white/6" />
                <span className="block h-4 w-7/12 animate-pulse rounded bg-white/6" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-fg-2 md:text-[14.5px]">
            <div className="lv-stack items-start">
            <div aria-hidden className={cn("space-y-2.5 pt-1.5 transition-opacity duration-500", phase < 4 ? "opacity-100" : "opacity-0")}>
                <span className="block h-3 w-full animate-pulse rounded bg-white/6" />
                <span className="block h-3 w-11/12 animate-pulse rounded bg-white/6" />
                <span className="block h-3 w-8/12 animate-pulse rounded bg-white/6" />
              </div>
            <p className={show(phase >= 4)}>
              Across the 42 B2B SaaS companies in the pilot, median first-response time improved by{" "}
              {phase >= 6 ? (
                <>
                  <span className="text-subtle line-through decoration-red/70">80%</span> <span className="rounded bg-green/12 px-1 font-medium text-green">60%</span>
                </>
              ) : (
                <span className={cn("rounded px-0.5 transition-colors duration-500", phase === 5 ? "bg-amber/20 text-amber ring-1 ring-amber/40" : "")}>80%</span>
              )}
              <Cite>S1</Cite> after routing password resets and refunds to narrow workflows.
            </p>
            </div>

            <div className="lv-stack items-start">
            <div aria-hidden className={cn("space-y-2.5 pt-1.5 transition-opacity duration-500", phase < 5 ? "opacity-100" : "opacity-0")}>
                <span className="block h-3 w-full animate-pulse rounded bg-white/6" />
                <span className="block h-3 w-11/12 animate-pulse rounded bg-white/6" />
                <span className="block h-3 w-8/12 animate-pulse rounded bg-white/6" />
              </div>
            <div className={cn("rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[12px] text-fg-2", show(phase === 5))} aria-hidden={phase !== 5}>
              <span className="font-medium text-amber">Fact-checker:</span> your notes say 80%. Pilot report S1 says “improved by 60%”. Using the supported figure.
            </div>

            <p className={show(phase >= 6)}>
              Teams that automated every ticket type at once saw escalations rise.<Cite>S2</Cite> Start with the two tickets your{" "}
              {phase >= 7 ? (
                <span className="rounded bg-green/12 px-1 text-green">teams</span>
              ) : (
                <span className={cn("rounded px-0.5", phase === 6 ? "bg-accent-tint text-accent-ink" : "")}>customers</span>
              )}{" "}
              send most, and measure one number.
            </p>
            </div>
          </div>

          <div className={cn("mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5", show(ready))}>
            <span className="font-mono text-[11px] text-muted">v2 · sha256 4f1c…9a2e</span>
            <span className={cn("inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-[12px] font-semibold text-[#140a05]", ready && "lv-live")}>
              <Check className="size-3.5" aria-hidden /> Approve this version
            </span>
          </div>
        </div>

        {/* Right: sources + score */}
        <aside className="hidden border-l border-line p-3 lg:block">
          <p className="mono-label mb-2 px-1 text-[11px]">Sources</p>
          <div className="space-y-2">
            {[
              ["S1", "Pilot report", "“median first-response time improved by 60%”", 2],
              ["S2", "Support automation benchmark", "“escalation rates rose by 12%”", 2],
              ["S3", "Help-center teardown", "Founder link", 3],
            ].map(([ref, title, quote, at]) => (
              <div key={ref as string} className={cn("rounded-lg border border-line bg-panel-2 p-2.5", show(phase >= (at as number)))}>
                <p className="font-mono text-[10px] text-accent-ink">{ref}</p>
                <p className="mt-0.5 text-[12px] text-fg-2">{title}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{quote}</p>
              </div>
            ))}
          </div>
          <div className={cn("mt-3 flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-2.5", show(phase >= 7))}>
            {phase >= 7 ? (
              <Ring value={92} size={46}>
                <span className="text-[13px] font-semibold text-fg">92</span>
              </Ring>
            ) : (
              <span className="size-[46px] rounded-full border-[3px] border-white/8" />
            )}
            <span className="text-[11px] leading-snug text-muted">
              Quality score
              <span className="block text-fg-2">Voice match 93</span>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
