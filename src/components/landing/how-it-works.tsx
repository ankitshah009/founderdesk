"use client";

import { useState } from "react";
import { BadgeCheck, FileSearch, Mail, Smartphone } from "lucide-react";
import { cn } from "../ui";

const STEPS = [
  {
    id: "inbox",
    icon: Mail,
    color: "text-[#8db4ff]",
    title: "Inbox",
    blurb: "Email your notes, a report and links. A fixed-scope reply comes back with the price.",
  },
  {
    id: "research",
    icon: FileSearch,
    color: "text-green",
    title: "Research",
    blurb: "Sources searched, fetched and kept only when a real passage supports a claim.",
  },
  {
    id: "review",
    icon: BadgeCheck,
    color: "text-amber",
    title: "Review",
    blurb: "A reviewer holds every number and scope to its source — and asks you when only you know.",
  },
  {
    id: "publish",
    icon: Smartphone,
    color: "text-accent-ink",
    title: "Publish",
    blurb: "You approve the exact text. We publish it, fetch it back, and open it on a real phone.",
  },
] as const;

type Id = (typeof STEPS)[number]["id"];

export function HowItWorks() {
  const [active, setActive] = useState<Id>("review");
  return (
    <div>
      <div role="tablist" aria-label="How FounderDesk works" className="grid grid-cols-2 border-y border-line md:grid-cols-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const on = s.id === active;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${s.id}`}
              id={`tab-${s.id}`}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex flex-col gap-2 border-line p-5 text-left transition-colors md:p-6",
                i % 2 === 0 ? "border-r" : "md:border-r",
                i < 2 ? "border-b md:border-b-0" : "",
                i === 3 ? "md:border-r-0" : "",
                on ? "bg-white/[0.04]" : "hover:bg-white/[0.02]",
              )}
            >
              <span className="flex items-center gap-2 text-sm text-fg">
                <Icon className={cn("size-4", s.color)} aria-hidden />
                {s.title}
              </span>
              <span className="text-sm leading-relaxed text-muted">{s.blurb}</span>
            </button>
          );
        })}
      </div>
      <div className="p-4 md:p-10">
        {STEPS.map((s) => (
          <div key={s.id} role="tabpanel" id={`panel-${s.id}`} aria-labelledby={`tab-${s.id}`} hidden={s.id !== active}>
            <Panel id={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Window({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
        <span className="truncate">{title}</span>
        {right}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

function Bubble({ who, children, mine }: { who: string; children: React.ReactNode; mine?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <span className="text-[11px] text-subtle">{who}</span>
      <div className={cn("max-w-[34rem] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed", mine ? "bg-[#262626] text-fg" : "border border-line bg-panel-2 text-fg-2")}>{children}</div>
    </div>
  );
}

function Panel({ id }: { id: Id }) {
  if (id === "inbox")
    return (
      <Window title="desk@founderdesk · Article on AI customer support" right={<span className="text-green">● Thread linked to order</span>}>
        <div className="space-y-4">
          <Bubble who="Dana · founder" mine>
            I want to write about why founders should start with narrow support workflows. Here are my notes, a pilot report, and two links. My audience is early-stage SaaS founders. Please keep the customer names private.
          </Bubble>
          <Bubble who="FounderDesk">
            We have your brief. One researched article for early-stage SaaS founders, every claim linked to a source, nothing published until you approve the exact text. Customer names stay private. <span className="text-fg">Pay $49 to start research →</span>
          </Bubble>
        </div>
      </Window>
    );
  if (id === "research")
    return (
      <Window title="Research · 6 sources · budget 8 searches / 8 pages">
        <ul className="divide-y divide-line text-sm">
          {[
            ["S1", "pilot-report.pdf", "Attachment", "fetched", "3,412 words"],
            ["S2", "Support automation benchmark 2026", "Monid search", "fetched", "1,980 words"],
            ["S3", "founder link · help-center teardown", "Founder link", "fetched", "1,204 words"],
            ["S4", "Vendor landing page", "Monid search", "empty", "No usable text — not cited"],
          ].map(([ref, title, kind, status, meta]) => (
            <li key={ref} className="flex items-center gap-3 py-2.5">
              <span className="w-7 font-mono text-xs text-accent-ink">{ref}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{title}</span>
              <span className="hidden text-xs text-muted sm:inline">{kind}</span>
              <span className={cn("w-40 text-right text-xs", status === "fetched" ? "text-green" : "text-subtle")}>{meta}</span>
            </li>
          ))}
        </ul>
      </Window>
    );
  if (id === "review")
    return (
      <Window title="Draft v1 · Reviewer" right={<span className="text-amber">Needs founder input</span>}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-amber/25 bg-amber/[0.06] p-4">
            <p className="text-xs font-medium text-amber">Figure mismatch · blocking</p>
            <p className="mt-2 text-sm text-fg">“Response time improved by 80%.”</p>
            <p className="mt-3 border-l-2 border-white/15 pl-3 text-sm text-muted">
              Pilot report <span className="text-accent-ink">S1</span>: “median first-response time improved by 60%”
            </p>
            <p className="mt-3 text-sm text-fg-2">Emailed you: <em>Do you have another report, or should I use the supported figure?</em></p>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-4">
            <p className="text-xs font-medium text-[#8db4ff]">Scope · fixed by the writer</p>
            <p className="mt-2 text-sm text-muted line-through decoration-white/30">Narrow workflows work for all companies.</p>
            <p className="mt-2 text-sm text-fg">Narrow workflows worked for the 42 B2B SaaS companies in the pilot. <span className="text-accent-ink">S1</span></p>
          </div>
        </div>
      </Window>
    );
  return (
    <Window title="Publication receipt" right={<span className="text-green">● Verified</span>}>
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {[
          ["Approved version", "v2 · sha256 4f1c…9a2e"],
          ["Destination", "founderdesk.app/a/why-narrow-support"],
          ["Served page", "200 · content hash matches"],
          ["Phone check", "Headline visible · sources linked · no layout issues"],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-b border-line pb-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Window>
  );
}
