"use client";

import { useRef } from "react";
import { BarChart3, CalendarDays, ClipboardCheck, Highlighter, Newspaper, PenLine, Plus, RefreshCw, Search, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { Chip, cn } from "../ui";
import { useCycle, useInView, useReducedMotion } from "./hooks";
import { delay, vars } from "./mock";

const PIPELINE = [
  {
    name: "Researcher",
    icon: Search,
    role: "Finds and fetches sources",
    log: ["Searched “support automation benchmark 2026”", "Kept S1 pilot-report.pdf, p.4: “improved by 60%”", "Dropped a vendor page with no usable passage"],
  },
  {
    name: "Writer",
    icon: PenLine,
    role: "Drafts in your voice",
    log: ["Loaded Brand Voice: short sentences, contractions", "Pulled K2 from the Knowledge Base: “automate the boring ticket first”", "Draft v1, 1,140 words, 9 cited claims"],
  },
  {
    name: "Fact-checker",
    icon: ShieldCheck,
    role: "Holds every claim to a passage",
    log: ["Claim 4: notes say 80%, S1 says 60%", "Emailed Dana one question", "Dana replied “use 60%”. Corrected in v2"],
  },
  {
    name: "Editor",
    icon: Highlighter,
    role: "Enforces your style guide",
    log: ["Replaced “customers” with “teams” (style guide)", "Removed “game-changer” (banned phrase)", "Headings set to sentence case"],
  },
  {
    name: "Reviewer",
    icon: ClipboardCheck,
    role: "Scores the draft",
    log: ["Quality 92: accuracy 98, voice match 93", "No open issues", "Sent the review page to Dana"],
  },
  {
    name: "You",
    icon: UserCheck,
    role: "Approve the exact text",
    log: ["Opened the review page", "Approved v3, sha256 4f1c…9a2e", "Published and verified on a phone"],
  },
] as const;

export function AgentPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [i, setI] = useCycle(PIPELINE.length, 2600, inView && !reduced);
  const active = reduced ? PIPELINE.length - 1 : i;
  const a = PIPELINE[active];
  const pct = (active / (PIPELINE.length - 1)) * 100;

  return (
    <div ref={ref} className="panel overflow-hidden">
      <div className="relative mx-4 mt-6 mb-4 md:mx-8 md:mt-8">
        {/* Track between the first and last node centres (desktop) */}
        <div aria-hidden className="absolute top-[22px] right-[calc(100%/12)] left-[calc(100%/12)] hidden h-px bg-line-strong md:block">
          <span className="block h-full origin-left bg-accent transition-transform duration-700 ease-[var(--lv-ease)]" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <ol className="relative grid grid-cols-3 gap-y-5 md:grid-cols-6">
          {PIPELINE.map((p, k) => {
            const Icon = p.icon;
            const state = k < active ? "done" : k === active ? "on" : "next";
            return (
              <li key={p.name} className="flex flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => setI(k)}
                  aria-pressed={k === active}
                  aria-label={`${p.name}: ${p.role}`}
                  className={cn(
                    "relative flex size-11 items-center justify-center rounded-xl border bg-[#0d0b0a] transition-colors duration-500",
                    state === "on" ? "lv-live border-accent/60 text-accent-ink" : state === "done" ? "border-green/30 text-green" : "border-line-strong text-subtle hover:text-fg-2",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </button>
                <span className={cn("mt-2.5 text-[13px] transition-colors", state === "next" ? "text-muted" : "text-fg")}>{p.name}</span>
                <span className="mt-0.5 hidden text-[11px] leading-snug text-subtle sm:block">{p.role}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="border-t border-line bg-[#0d0b0a] px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="mono-label text-[11px]">
            {a.name} · narrow support workflows
          </p>
          <Chip tone={a.name === "You" ? "green" : "accent"}>{a.name === "You" ? "Approved" : "Working"}</Chip>
        </div>
        <ul key={active} className="mt-3 h-[84px] space-y-1.5 font-mono text-[12px] leading-snug">
          {a.log.map((line, k) => (
            <li key={line} className="lv-rise flex gap-3 truncate" style={delay(k * 450)}>
              <span className="text-subtle">10:{String(31 + active * 2 + k).padStart(2, "0")}</span>
              <span className={cn("truncate", k === a.log.length - 1 ? "text-fg" : "text-fg-2")}>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ANALYSTS = [
  { icon: BarChart3, name: "Performance analyst", body: "Reads views and reads on your published articles and tells you what held attention.", cadence: "After each publish", tone: "neutral" as const },
  { icon: RefreshCw, name: "Refresh analyst", body: "Flags articles whose sources or numbers have gone stale and drafts the update.", cadence: "Weekly scan", tone: "neutral" as const },
];

const CUSTOM = [
  { icon: Newspaper, name: "Weekly columnist", body: "Turns the week's notes and wins into a founder update.", cadence: "Mondays, 8:00", next: "Next run in 2 days", live: true },
  { icon: Search, name: "Industry analyst", body: "Watches your approved sources and drafts a monthly analysis.", cadence: "1st of the month", next: "Next run Dec 1", live: false },
  { icon: CalendarDays, name: "Newsletter editor", body: "Builds Friday's issue from the week's approved articles.", cadence: "Fridays, 7:00", next: "Next run Friday", live: false },
];

export function AgentCards() {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div data-reveal="" className="panel p-5">
        <p className="mono-label text-[11px]">Analysts</p>
        <ul className="mt-4 space-y-3">
          {ANALYSTS.map((x) => {
            const Icon = x.icon;
            return (
              <li key={x.name} className="flex gap-3 rounded-lg border border-line bg-panel-2 p-3.5 transition-colors hover:border-line-strong">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/6 text-fg-2">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-fg">{x.name}</span>
                    <Chip>{x.cadence}</Chip>
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">{x.body}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div data-reveal="" className="panel p-5" style={vars({ "--d": "120ms" })}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label text-[11px]">Custom agents you configure</p>
          <Link href="/studio" className="text-xs text-muted hover:text-fg">
            Configure in Studio →
          </Link>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {CUSTOM.map((x) => {
            const Icon = x.icon;
            return (
              <li key={x.name} className="flex flex-col rounded-lg border border-line bg-panel-2 p-3.5 transition-[border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-line-strong">
                <span className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent-tint text-accent-ink">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span aria-hidden className={cn("relative h-4 w-7 rounded-full", x.live ? "bg-accent" : "bg-white/12")}>
                    <span className={cn("absolute top-0.5 size-3 rounded-full bg-fg transition-transform", x.live ? "translate-x-3.5" : "translate-x-0.5")} />
                  </span>
                </span>
                <span className="mt-3 text-sm text-fg">{x.name}</span>
                <span className="mt-1 text-[13px] leading-relaxed text-muted">{x.body}</span>
                <span className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <Chip tone="accent">{x.cadence}</Chip>
                  <span className="text-subtle">{x.next}</span>
                </span>
              </li>
            );
          })}
          <li>
            <Link href="/studio" className="flex h-full min-h-[96px] sm:min-h-[150px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm text-muted transition-colors hover:border-accent/50 hover:text-fg">
              <Plus className="size-5" aria-hidden />
              New agent
            </Link>
          </li>
        </ul>
        <p className="mt-4 text-xs text-subtle">Scheduled agents draft. Nothing they write is published until you approve it.</p>
      </div>
    </div>
  );
}
