"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, FileText } from "lucide-react";
import { Chip, cn } from "../ui";
import { useCycle, useInView, useReducedMotion } from "./hooks";
import { Cite, delay } from "./mock";

function Avatar() {
  return <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-[#140a05]">D</span>;
}

function Author({ sub, glyph }: { sub: string; glyph: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar />
      <div className="min-w-0 text-[12px] leading-tight">
        <p className="font-semibold text-fg">Dana Reyes</p>
        <p className="text-subtle">{sub}</p>
      </div>
      <span className="ml-auto text-[12px] font-bold text-fg-2">{glyph}</span>
    </div>
  );
}

function ArticlePreview() {
  return (
    <div>
      <p className="font-mono text-[10px] text-subtle">founderdesk.app/a/why-narrow-support</p>
      <p className="lv-rise mt-3 text-xl font-semibold leading-tight tracking-[-0.03em] text-fg md:text-2xl">Why founders should start with narrow support workflows</p>
      <p className="lv-rise mt-3 max-w-xl text-[13.5px] leading-relaxed text-fg-2" style={delay(120)}>
        Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60%
        <Cite>S1</Cite> after teams routed password resets and refunds first. Teams that automated every ticket type at once saw escalations rise.
        <Cite>S2</Cite>
      </p>
      <div className="lv-rise mt-4 flex flex-wrap gap-2 text-[11px]" style={delay(240)}>
        <span className="rounded-md bg-white/6 px-2 py-1 text-fg-2">S1 · Pilot report</span>
        <span className="rounded-md bg-white/6 px-2 py-1 text-fg-2">S2 · Support benchmark</span>
        <span className="rounded-md bg-green/12 px-2 py-1 text-green">Verified live · phone checked</span>
      </div>
    </div>
  );
}

function NewsletterPreview() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-[#141210] p-4">
      <p className="text-[11px] text-subtle">From: Dana at Northwind</p>
      <p className="mt-1 text-[13px] font-semibold text-fg">Subject: The 60% fix we almost skipped</p>
      <p className="text-[11px] text-subtle">Preview: Why we automated one boring ticket first.</p>
      <p className="lv-rise mt-3 text-[13px] leading-relaxed text-fg-2" style={delay(120)}>
        Last quarter we tried to automate all of support at once. It went badly. Here is what the pilot data showed when we started narrow instead.
      </p>
      <span className="lv-rise mt-4 inline-block bg-accent px-2.5 py-1 text-[11px] font-semibold text-[#140a05]" style={delay(240)}>
        Read the full piece
      </span>
    </div>
  );
}

function ThreadPreview() {
  const posts = [
    "We cut first-response time 60% by automating one boring thing first: password resets. 🧵",
    "We tried automating every ticket type at once. Escalations went up. So we started over with two.",
    "The data is from a pilot across 42 B2B SaaS companies. Full write-up with sources ↓",
  ];
  return (
    <div className="mx-auto max-w-md">
      <Author sub="@danareyes" glyph="𝕏" />
      <ol className="relative mt-3 space-y-3 pl-9">
        <span aria-hidden className="absolute top-1 bottom-4 left-[13px] w-px bg-line-strong" />
        {posts.map((p, i) => (
          <li key={i} className="lv-rise relative text-[13px] leading-relaxed text-fg" style={delay(i * 180)}>
            <span aria-hidden className="absolute top-1.5 -left-[27px] size-2 rounded-full bg-white/25" />
            {p}
            <span className="ml-2 font-mono text-[10px] text-subtle">{i + 1}/4</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LinkedInPreview() {
  return (
    <div className="mx-auto max-w-md">
      <Author sub="Founder at Northwind · 2m" glyph="in" />
      <p className="lv-rise mt-3 text-[13px] leading-relaxed text-fg" style={delay(100)}>
        Most founders try to automate all of support at once. We did too, and it backfired.
      </p>
      <p className="lv-rise mt-2 text-[13px] leading-relaxed text-fg" style={delay(200)}>
        The pilot data says start narrow: pick the two tickets you get most, automate those, and measure one number.
      </p>
      <div className="lv-rise mt-3 rounded-lg border border-white/10 p-2.5 text-[11px]" style={delay(300)}>
        <p className="text-subtle">founderdesk.app</p>
        <p className="mt-0.5 text-fg-2">Why founders should start with narrow support workflows</p>
      </div>
    </div>
  );
}

function CarouselPreview() {
  const slides = ["Start narrow.", "60% faster first replies", "Resets, then refunds, then the rest", "42 SaaS teams in the pilot"];
  return (
    <div className="overflow-hidden">
      <div className="lv-slides flex gap-3">
        {slides.map((t, i) => (
          <div key={t} className={cn("flex aspect-[4/5] w-[108px] shrink-0 items-end rounded-lg p-2.5 text-[13px] font-semibold leading-tight", i === 0 ? "bg-accent text-[#140a05]" : "border border-line bg-white/6 text-fg-2")}>
            {t}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">Caption: We automated one boring ticket first. Here is what happened. Link in bio.</p>
    </div>
  );
}

const CHANNELS: Array<{ id: string; name: string; note: string; preview: ReactNode }> = [
  { id: "article", name: "Article", note: "Your voice, a source beside every claim", preview: <ArticlePreview /> },
  { id: "newsletter", name: "Newsletter", note: "Subject, preview text and a short issue", preview: <NewsletterPreview /> },
  { id: "x", name: "X thread", note: "A strong first line and a link back", preview: <ThreadPreview /> },
  { id: "linkedin", name: "LinkedIn post", note: "Written for your network, not pasted", preview: <LinkedInPreview /> },
  { id: "instagram", name: "Instagram carousel", note: "Slides and a caption", preview: <CarouselPreview /> },
];

export function ChannelFanout() {
  const ref = useRef<HTMLDivElement>(null);
  const btns = useRef<Array<HTMLButtonElement | null>>([]);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState(false);
  const [i, setI] = useCycle(CHANNELS.length, 4200, inView && !reduced && !picked);

  function pick(k: number, focus = false) {
    const n = (k + CHANNELS.length) % CHANNELS.length;
    setPicked(true);
    setI(n);
    if (focus) btns.current[n]?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: CHANNELS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    pick(map[e.key], true);
  }

  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div>
        {/* Source */}
        <div className="rounded-xl border border-line-strong bg-panel p-4">
          <p className="flex items-center gap-2 text-[11px] text-muted">
            <FileText className="size-3.5" aria-hidden /> One approved article
          </p>
          <p className="mt-2 text-[15px] font-medium leading-snug text-fg">Why founders should start with narrow support workflows</p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-subtle">
            <Check className="size-3 text-green" aria-hidden /> v3 · sha256 4f1c…9a2e
          </p>
        </div>
        {/* Trunk and branches */}
        <div role="tablist" aria-label="Channels" aria-orientation="vertical" onKeyDown={onKeyDown} className="relative ml-6 border-l border-line-strong pt-2">
          {CHANNELS.map((c, k) => {
            const on = k === i;
            return (
              <div key={c.id} className="relative pt-2 pl-6">
                <span aria-hidden className={cn("absolute top-[30px] left-0 h-px w-6 transition-colors duration-500", on ? "bg-accent" : "bg-line-strong")} />
                <button
                  ref={(el) => {
                    btns.current[k] = el;
                  }}
                  role="tab"
                  id={`ch-tab-${c.id}`}
                  aria-selected={on}
                  aria-controls={`ch-panel-${c.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pick(k)}
                  className={cn("w-full rounded-lg border px-3 py-2 text-left transition-colors duration-300", on ? "border-accent/50 bg-accent-tint" : "border-line bg-panel hover:border-line-strong")}
                >
                  <span className={cn("block text-sm", on ? "text-fg" : "text-fg-2")}>{c.name}</span>
                  <span className="block text-[12px] text-muted">{c.note}</span>
                </button>
              </div>
            );
          })}
          <span aria-hidden className="absolute -bottom-px -left-[3px] size-1.5 rounded-full bg-line-strong" />
        </div>
      </div>
      <div className="panel relative flex min-h-[340px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
          <span>{CHANNELS[i].name} · written from v3</span>
          <Chip tone="green">Approved on its own</Chip>
        </div>
        <div className="lv-stack flex-1 p-5 md:p-8">
          {CHANNELS.map((c, k) => (
            <div key={c.id} role="tabpanel" id={`ch-panel-${c.id}`} aria-labelledby={`ch-tab-${c.id}`} aria-hidden={k !== i} inert={k !== i} className={cn("lv-panel self-center", k === i ? "is-active" : "lv-gate")}>
              {c.preview}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DESTINATIONS: Array<[string, string, "green" | "neutral" | "accent"]> = [
  ["Verified web article", "Included", "green"],
  ["WordPress", "Connect your site", "neutral"],
  ["Ghost", "Connect your site", "neutral"],
  ["Webflow", "Connect your site", "neutral"],
  ["X", "Connected account", "accent"],
  ["LinkedIn", "Connected account", "accent"],
];

export function Destinations() {
  return (
    <ul data-reveal="" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {DESTINATIONS.map(([name, note, tone]) => (
        <li key={name} className="flex flex-col gap-2 bg-bg p-4">
          <span className="text-sm text-fg">{name}</span>
          <span>
            <Chip tone={tone}>{note}</Chip>
          </span>
        </li>
      ))}
    </ul>
  );
}
