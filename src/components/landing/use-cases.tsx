"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../ui";
import { delay } from "./mock";

type Case = { name: string; situation: string; publish: string; uses: string[] };

const GROUPS: Array<{ id: string; label: string; cases: Case[] }> = [
  {
    id: "industry",
    label: "By industry",
    cases: [
      { name: "B2B SaaS", situation: "Buyers read before they book a demo, and they check your numbers.", publish: "Customer-problem essays, launch posts and a monthly product note.", uses: ["Knowledge Base", "Fact-checker", "Every channel"] },
      { name: "Fintech", situation: "A loose claim about fees, returns or compliance is a real risk.", publish: "Regulation-sensitive explainers where every figure is held to its source, and anything unsupported is cut or asked about.", uses: ["Fact-checker", "Style guide", "Version history"] },
      { name: "Healthtech", situation: "You cannot publish clinical claims your evidence does not support.", publish: "Patient and clinician explainers with study scope stated exactly and no unsupported clinical claims.", uses: ["Fact-checker", "Audience personas", "Credibility check"] },
      { name: "Climate", situation: "Impact numbers get scrutinized, and vague claims read as greenwashing.", publish: "Impact updates and policy commentary with each number traced to the report it came from.", uses: ["Knowledge Base", "Fact-checker", "Refresh analyst"] },
      { name: "Devtools", situation: "Developers spot hand-waving in the first paragraph.", publish: "Technical deep-dives, changelog stories and launch threads for X.", uses: ["Developer persona", "Brand Voice", "X thread"] },
      { name: "Consumer", situation: "Attention is short, and the story has to work on a phone.", publish: "Founder story posts, Instagram carousels and a weekly newsletter.", uses: ["Instagram carousel", "Hook Tournament", "Trend Timing Radar"] },
    ],
  },
  {
    id: "founder",
    label: "By founder",
    cases: [
      { name: "Technical founder", situation: "You know the product cold, but a post takes you a week.", publish: "Architecture and lessons-learned posts in plain language, written from your notes.", uses: ["Brand Voice", "Highlight and ask", "Readability score"] },
      { name: "Solo founder", situation: "No marketing team, and every hour writing is an hour not building.", publish: "A weekly founder update, drafted on a schedule by a custom agent and approved in minutes.", uses: ["Custom agents", "Calendar", "Connected accounts"] },
      { name: "First-time founder", situation: "You are not sure yet what is worth saying.", publish: "Build-in-public posts, tested in Idea Lab before you write them.", uses: ["Idea Lab", "Audience Reaction Panel", "Quality score"] },
      { name: "Non-native English writer", situation: "Your ideas are sharp. The phrasing slows you down.", publish: "Articles that keep your meaning and your voice, in fluent English you approve line by line.", uses: ["Brand Voice", "Highlight and ask", "Memory"] },
      { name: "Busy CEO", situation: "You have ten minutes between meetings.", publish: "Thought leadership from a voice memo or an email of notes. You answer at most one question, then approve.", uses: ["Email intake", "Fact-checker", "Exact-version approval"] },
    ],
  },
  {
    id: "stage",
    label: "By stage",
    cases: [
      { name: "Pre-seed", situation: "You need people to know you exist.", publish: "Build-in-public posts and a monthly investor update.", uses: ["Idea Lab", "Weekly columnist", "Connected accounts"] },
      { name: "Seed", situation: "You are still finding the story that sells.", publish: "Customer-problem essays and launch announcements, adapted for every channel.", uses: ["Every channel", "Audience personas", "Insights"] },
      { name: "Series A", situation: "You are hiring, and you need credibility in your category.", publish: "Thought leadership and hiring posts that sound like the founder, not a ghostwriter.", uses: ["Brand Voice", "Knowledge Base", "Style guide"] },
      { name: "Growth", situation: "Several people now publish under the company name.", publish: "A calendar of analysis pieces under one style guide, with a refresh pass on older posts.", uses: ["Workflows and calendar", "Style guide", "Refresh analyst"] },
    ],
  },
];

export function UseCases() {
  const [g, setG] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function pick(k: number, focus = false) {
    const n = (k + GROUPS.length) % GROUPS.length;
    setG(n);
    if (focus) tabs.current[n]?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, number> = { ArrowRight: g + 1, ArrowLeft: g - 1, Home: 0, End: GROUPS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    pick(map[e.key], true);
  }

  return (
    <div>
      <div role="tablist" aria-label="Use cases" onKeyDown={onKeyDown} className="relative inline-grid grid-cols-3 rounded-lg border border-line bg-panel p-1 text-sm">
        <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-8px)/3)] rounded-md bg-white/10 transition-transform duration-500 ease-[var(--lv-ease)]" style={{ transform: `translateX(${g * 100}%)` }} />
        {GROUPS.map((x, k) => (
          <button
            key={x.id}
            ref={(el) => {
              tabs.current[k] = el;
            }}
            role="tab"
            id={`uc-tab-${x.id}`}
            aria-selected={k === g}
            aria-controls={`uc-panel-${x.id}`}
            tabIndex={k === g ? 0 : -1}
            onClick={() => pick(k)}
            className={cn("relative px-3 py-1.5 whitespace-nowrap transition-colors sm:px-5", k === g ? "text-fg" : "text-muted hover:text-fg-2")}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="lv-stack mt-6">
        {GROUPS.map((x, k) => (
          <div key={x.id} role="tabpanel" id={`uc-panel-${x.id}`} aria-labelledby={`uc-tab-${x.id}`} aria-hidden={k !== g} inert={k !== g} className={cn("lv-panel self-start", k === g ? "is-active" : "lv-gate")}>
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {x.cases.map((c, i) => (
                <li key={c.name} className="lv-rise flex flex-col rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong" style={delay(i * 70)}>
                  <p className="text-[17px] font-medium tracking-[-0.015em] text-fg">{c.name}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.situation}</p>
                  <p className="mono-label mt-4 text-[11px] text-accent-ink">What they publish</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{c.publish}</p>
                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {c.uses.map((u) => (
                      <li key={u} className="rounded-md bg-white/6 px-2 py-0.5 text-[11.5px] text-fg-2 ring-1 ring-inset ring-white/8">
                        {u}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
