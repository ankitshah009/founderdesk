"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Copy, History, MessagesSquare, Radar, Scale, Trophy } from "lucide-react";
import { Chip, cn } from "../ui";
import { useCycle, useInView, useReducedMotion } from "./hooks";
import { Meter, delay } from "./mock";

/*
 * Idea Lab: six tools that test an idea before it is written. The example idea
 * is the follow-up the Performance analyst suggested in the tour.
 */

function ViralTwin() {
  // Past posts along an engagement axis (0–100), plus the predicted band.
  const past = [6, 9, 12, 14, 17, 19, 21, 24, 26, 28, 31, 33, 35, 38, 41, 44, 47, 52, 55, 61, 66, 72, 81];
  return (
    <div>
      <p className="text-[12px] text-muted">Predicted against 120 of your posts and 8 founders with similar audiences</p>
      <div className="relative mt-8 h-14">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <span className="lv-grow-x absolute top-1 bottom-1 rounded-md border border-accent/50 bg-accent-tint" style={delay(500, { left: "58%", width: "20%" })} />
        {past.map((x, i) => (
          <span key={i} className="lv-pop absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" style={delay(i * 25, { left: `${x}%` })} />
        ))}
        <span className="lv-fade absolute -top-6 text-[11px] text-accent-ink" style={delay(900, { left: "58%" })}>
          This draft
        </span>
      </div>
      <p className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>fewer reactions</span>
        <span>more</span>
      </p>
      <div className="lv-rise mt-5 grid gap-2 sm:grid-cols-3" style={delay(1000)}>
        {[
          ["Likely range", "Top 30% of your posts"],
          ["Best channel", "LinkedIn"],
          ["Closest twin", "“Our first support hire”"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-panel-2 p-2.5">
            <p className="text-[11px] text-subtle">{k}</p>
            <p className="mt-0.5 text-[13px] text-fg">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-[12.5px]">
        {[
          ["+", "A specific number in the first line", "text-green"],
          ["+", "Admits a mistake, like your best posts", "text-green"],
          ["−", "Longer than your usual LinkedIn post", "text-amber"],
        ].map(([sign, t, c], i) => (
          <li key={t} className="lv-rise flex gap-2.5" style={delay(1200 + i * 120)}>
            <span className={cn("w-3 font-mono", c)}>{sign}</span>
            <span className="text-fg-2">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reactions() {
  const r: Array<[string, "amber" | "blue" | "green", string, string]> = [
    ["Investor", "blue", "Question", "Does the 60% hold outside B2B SaaS, or only in the pilot?"],
    ["Customer", "green", "Interest", "Which two ticket types did you start with, and why those?"],
    ["Developer", "amber", "Objection", "How did you measure first response? Median or mean?"],
  ];
  return (
    <ul className="space-y-2.5">
      {r.map(([who, tone, kind, text], i) => (
        <li key={who} className="lv-rise rounded-lg border border-line bg-panel-2 p-3" style={delay(i * 260)}>
          <p className="flex items-center gap-2 text-[11px]">
            <span className="text-fg-2">{who} persona</span>
            <Chip tone={tone}>{kind}</Chip>
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-fg">“{text}”</p>
        </li>
      ))}
      <li className="lv-fade text-[12px] text-muted" style={delay(900)}>
        Suggested: answer the measurement question in the second paragraph.
      </li>
    </ul>
  );
}

function Analogs() {
  const rows: Array<[string, string, number, boolean]> = [
    ["Your post · “Our first support hire”", "LinkedIn", 2.1, true],
    ["Similar founder · “We stopped automating everything”", "LinkedIn", 1.6, true],
    ["Similar founder · “What our refund queue taught us”", "X", 1.3, true],
    ["Your post · “Support tooling roundup”", "LinkedIn", 0.4, false],
  ];
  return (
    <div>
      <p className="text-[12px] text-muted">Comparable posts, normalized for account size and platform. 1.0× is the typical post.</p>
      <ul className="mt-4 space-y-3">
        {rows.map(([t, p, x, hi], i) => (
          <li key={t} className="lv-rise" style={delay(i * 160)}>
            <span className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-fg-2">{t}</span>
              <span className="shrink-0 font-mono text-fg">{x.toFixed(1)}×</span>
            </span>
            <span className="flex items-center gap-2">
              <Meter value={(x / 2.4) * 100} d={150 + i * 160} tone={hi ? "accent" : "muted"} className="flex-1" />
              <span className="w-14 text-right text-[10.5px] text-subtle">{p}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="lv-fade mt-4 text-[12px] text-muted" style={delay(900)}>
        Pattern in the high performers: a specific number in the first line, and a mistake admitted.
      </p>
    </div>
  );
}

function Hooks() {
  const hooks: Array<[string, number]> = [
    ["We automated one boring ticket first. Replies came 60% faster.", 86],
    ["Stop automating all of support at once.", 79],
    ["The refund queue taught us more than our roadmap did.", 71],
    ["What 42 SaaS teams learned about support automation.", 64],
    ["Support automation: a thread.", 38],
  ];
  return (
    <div>
      <p className="text-[12px] text-muted">6 hooks scored against your audience signals. Top 5 shown.</p>
      <ol className="mt-4 space-y-2">
        {hooks.map(([h, s], i) => (
          <li key={h} className={cn("lv-rise grid grid-cols-[18px_1fr_44px] items-center gap-3 rounded-lg border px-3 py-2", i === 0 ? "border-accent/40 bg-accent-tint" : "border-line bg-panel-2")} style={delay(i * 140)}>
            <span className={cn("font-mono text-[11px]", i === 0 ? "text-accent-ink" : "text-subtle")}>{i + 1}</span>
            <span className="min-w-0">
              <span className={cn("block truncate text-[12.5px]", i === 0 ? "text-fg" : "text-fg-2")}>{h}</span>
              <Meter value={s} d={200 + i * 140} tone={i === 0 ? "accent" : "muted"} className="mt-1.5 h-1" />
            </span>
            <span className="text-right font-mono text-[12px] text-fg">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Timing() {
  const blips: Array<[number, number, string]> = [
    [30, 34, "accent"],
    [64, 26, "accent"],
    [72, 62, "white"],
    [38, 70, "white"],
    [52, 46, "accent"],
  ];
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[170px_1fr]">
      <div aria-hidden className="relative mx-auto size-[160px] overflow-hidden rounded-full border border-line-strong">
        <span className="absolute inset-[22%] rounded-full border border-line" />
        <span className="absolute inset-[44%] rounded-full border border-line" />
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span className="lv-sweep absolute top-1/2 left-1/2 h-px w-1/2 origin-left bg-accent/70" />
        {blips.map(([x, y, c], i) => (
          <span key={i} className={cn("lv-pop absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", c === "accent" ? "bg-accent" : "bg-white/40")} style={delay(300 + i * 160, { left: `${x}%`, top: `${y}%` })} />
        ))}
      </div>
      <div>
        <ul className="space-y-2 text-[12.5px]">
          {[
            ["Discussion of AI support agents", "Rising", "green"],
            ["Search interest, “support automation”", "Steady", "neutral"],
            ["News: two support-tool launches this week", "Rising", "green"],
          ].map(([k, v, t], i) => (
            <li key={k} className="lv-rise flex items-center justify-between gap-3 border-b border-line pb-2" style={delay(200 + i * 160)}>
              <span className="text-fg-2">{k}</span>
              <Chip tone={t as "green" | "neutral"}>{v}</Chip>
            </li>
          ))}
        </ul>
        <p className="lv-rise mt-3 rounded-lg border border-accent/30 bg-accent-tint px-3 py-2 text-[12.5px] text-fg" style={delay(800)}>
          Suggested window: Tuesday or Wednesday morning, while the launches are being discussed.
        </p>
      </div>
    </div>
  );
}

function Credibility() {
  const pts: Array<[number, number, string, "green" | "red" | "neutral"]> = [
    [78, 24, "Automating everything at once raised escalations", "green"],
    [22, 20, "Narrow workflows work for every company", "red"],
    [80, 74, "Password resets are a common ticket type", "neutral"],
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
      <div aria-hidden className="relative aspect-square w-full max-w-[200px] rounded-lg border border-line bg-panel-2">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span className="absolute top-1.5 left-2 text-[9.5px] text-subtle">surprising</span>
        <span className="absolute right-2 bottom-1.5 text-[9.5px] text-subtle">supported →</span>
        {pts.map(([x, y, , t], i) => (
          <span key={i} className={cn("lv-pop absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-mono text-[10px] text-[#140a05]", t === "green" ? "bg-green" : t === "red" ? "bg-red" : "bg-white/50")} style={delay(200 + i * 200, { left: `${x}%`, top: `${y}%` })}>
            {i + 1}
          </span>
        ))}
      </div>
      <ul className="space-y-2">
        {pts.map(([, , claim, t], i) => (
          <li key={claim} className="lv-rise rounded-lg border border-line bg-panel-2 p-2.5" style={delay(300 + i * 200)}>
            <p className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-subtle">{i + 1}</span>
              <Chip tone={t}>{t === "green" ? "Surprising and supported, S2" : t === "red" ? "Surprising, no source" : "Supported, not surprising"}</Chip>
            </p>
            <p className="mt-1 text-[12.5px] text-fg-2">{claim}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TOOLS: Array<{ id: string; name: string; icon: typeof Copy; body: string; demo: ReactNode }> = [
  { id: "twin", name: "Viral Twin Simulator", icon: Copy, body: "Predicts how a draft will do against your own past posts and similar creators.", demo: <ViralTwin /> },
  { id: "panel", name: "Audience Reaction Panel", icon: MessagesSquare, body: "Simulated objections, questions and interest from your personas.", demo: <Reactions /> },
  { id: "analogs", name: "Historical Analog Finder", icon: History, body: "Comparable high and low performers, normalized for account size and platform.", demo: <Analogs /> },
  { id: "hooks", name: "Hook Tournament", icon: Trophy, body: "Five to ten hooks scored against your audience signals.", demo: <Hooks /> },
  { id: "timing", name: "Trend Timing Radar", icon: Radar, body: "Rising discussions, search and news, to time when you publish.", demo: <Timing /> },
  { id: "cred", name: "Controversy vs Credibility", icon: Scale, body: "Checks your most surprising claims for factual support before you post.", demo: <Credibility /> },
];

export function IdeaLab() {
  const ref = useRef<HTMLDivElement>(null);
  const btns = useRef<Array<HTMLButtonElement | null>>([]);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState(false);
  const [hover, setHover] = useState(false);
  const [i, setI] = useCycle(TOOLS.length, 6500, inView && !reduced && !picked && !hover);

  function pick(k: number, focus = false) {
    const n = (k + TOOLS.length) % TOOLS.length;
    setPicked(true);
    setI(n);
    if (focus) btns.current[n]?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: TOOLS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    pick(map[e.key], true);
  }

  return (
    <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="panel grid overflow-hidden lg:grid-cols-[320px_1fr]">
      <div role="tablist" aria-label="Idea Lab tools" aria-orientation="vertical" onKeyDown={onKeyDown} className="lv-rail flex gap-1 overflow-x-auto border-b border-line p-2 lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0">
        {TOOLS.map((t, k) => {
          const Icon = t.icon;
          const on = k === i;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btns.current[k] = el;
              }}
              role="tab"
              id={`lab-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`lab-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(k)}
              className={cn("flex shrink-0 items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}
            >
              <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors", on ? "border-accent/50 bg-accent-tint text-accent-ink" : "border-line text-muted")}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block whitespace-nowrap text-sm", on ? "text-fg" : "text-fg-2")}>{t.name}</span>
                <span className="mt-0.5 hidden text-[12px] leading-snug text-muted lg:block">{t.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 bg-[#0d0b0a] p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label text-[11px]">Idea · What we automated second: refunds</p>
          <Chip>Example</Chip>
        </div>
        <p className="mb-4 text-sm text-muted lg:hidden">{TOOLS[i].body}</p>
        <div className="lv-stack">
          {TOOLS.map((t, k) => (
            <div key={t.id} role="tabpanel" id={`lab-panel-${t.id}`} aria-labelledby={`lab-tab-${t.id}`} aria-hidden={k !== i} inert={k !== i} className={cn("lv-panel", k === i ? "is-active" : "lv-gate")}>
              {t.demo}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
