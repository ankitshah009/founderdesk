import type { ReactNode } from "react";
import { BookOpen, Check, FileUp, Globe, History, Type } from "lucide-react";
import { Chip, cn } from "../ui";
import { HighlightAskDemo, PersonaDemo } from "./micro";
import { Meter, Ring, delay } from "./mock";
import { SCORES } from "./tutorial-panels";

/* The Studio feature grid. Demos are CSS-animated, and play when each tile is revealed. */

function Tile({ name, title, body, children, className, d = 0, demoClassName }: { name: string; title: string; body: string; children: ReactNode; className?: string; d?: number; demoClassName?: string }) {
  return (
    <li data-reveal="" style={delay(d)} className={cn("group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition-colors duration-300 hover:border-line-strong", className)}>
      <div className={cn("relative overflow-hidden border-b border-line bg-[#0d0b0a] p-4 md:p-5", demoClassName ?? "h-[230px]")}>{children}</div>
      <div className="p-5">
        <p className="mono-label text-[11px] text-accent-ink">{name}</p>
        <h3 className="mt-2 text-[17px] font-medium tracking-[-0.015em] text-fg">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

const EQ = [38, 62, 48, 80, 56, 92, 40, 70, 58, 86, 44, 66, 74, 50, 90, 60, 36, 78, 54, 84, 46, 68, 88, 52, 72, 42, 64, 82, 58, 76, 48, 70];

function VoiceDemo() {
  return (
    <div aria-hidden className="grid h-full gap-5 sm:grid-cols-[1fr_1fr]">
      <div className="flex flex-col">
        <p className="flex items-center justify-between text-[11px] text-muted">
          <span>Voice fingerprint · 18 pieces</span>
          <span className="text-fg-2">Dana Reyes</span>
        </p>
        <div className="mt-3 flex h-20 items-end gap-[3px]">
          {EQ.map((h, i) => (
            <span key={i} className="lv-grow-y flex-1" style={delay(i * 25, { height: `${h}%` })}>
              <span className={cn("lv-eq block h-full rounded-sm", i % 7 === 3 ? "bg-accent" : "bg-white/20")} style={delay(i * 80)} />
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["“start boring”", "“one number”", "we, not I", "Grade 8"].map((t, i) => (
            <span key={t} className="lv-pop rounded-md bg-white/6 px-1.5 py-0.5 text-[11px] text-fg-2" style={delay(500 + i * 100)}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="hidden flex-col sm:flex">
        <ul className="space-y-2.5">
          {(
            [
              ["Sentence rhythm", 68],
              ["Contractions", 82],
              ["First person", 64],
              ["Reading level", 44],
            ] as const
          ).map(([k, v], i) => (
            <li key={k}>
              <span className="mb-1 block text-[11px] text-muted">{k}</span>
              <Meter value={v} d={200 + i * 120} />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
          <Ring value={93} size={34} d={500}>
            <span className="text-[10px] font-semibold text-fg">93</span>
          </Ring>
          <span className="text-[11px] leading-snug text-muted">
            Voice match on draft v3
            <span className="block text-fg-2">2 sentences flagged as “not you”</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function KnowledgeDemo() {
  const items = [
    ["Company fact", "42-company pilot"],
    ["Opinion", "Automate boring first"],
    ["Prior article", "Our first support hire"],
  ];
  return (
    <div aria-hidden className="grid h-full grid-cols-[1fr_36px_1fr] grid-rows-3 items-center gap-y-2">
      {items.map(([k, v], i) => (
        <div key={k} className="contents">
          <div className="lv-rise min-w-0 rounded-md border border-line bg-panel-2 px-2 py-1.5" style={delay(i * 120, { gridRow: i + 1, gridColumn: 1 })}>
            <span className="block text-[9.5px] text-subtle">{k}</span>
            <span className="block truncate text-[11px] text-fg-2">{v}</span>
          </div>
          <span className="lv-track relative block h-px bg-line-strong" style={{ gridRow: i + 1, gridColumn: 2 }}>
            <span className="lv-travel absolute -top-[2.5px] left-0 block size-1.5 rounded-full bg-accent" style={delay(i * 860)} />
          </span>
        </div>
      ))}
      <div className="row-span-3 self-center rounded-lg border border-line bg-panel-2 p-2.5" style={{ gridRow: "1 / span 3", gridColumn: 3 }}>
        <p className="text-[9.5px] text-subtle">Draft</p>
        <p className="mt-1 text-[11px] leading-snug text-fg-2">
          We ran a pilot with 42 companies{" "}
          <span className="lv-glow-cite rounded px-0.5 font-mono text-[9.5px]" style={delay(0)}>
            K1
          </span>
          . Our rule: automate the boring ticket first{" "}
          <span className="lv-glow-cite rounded px-0.5 font-mono text-[9.5px]" style={delay(860)}>
            K2
          </span>
          , as we wrote in{" "}
          <span className="lv-glow-cite rounded px-0.5 font-mono text-[9.5px]" style={delay(1720)}>
            K3
          </span>
        </p>
      </div>
    </div>
  );
}

function OnboardingDemo() {
  const url = "northwind.dev";
  return (
    <div aria-hidden className="flex h-full flex-col">
      <div className="grid grid-cols-3 rounded-lg border border-line bg-panel-2 p-0.5 text-[11px]">
        <span className="flex items-center justify-center gap-1 rounded-md bg-white/10 py-1 text-fg">
          <Globe className="size-3" /> Website
        </span>
        <span className="flex items-center justify-center gap-1 py-1 text-muted">
          <FileUp className="size-3" /> PDF
        </span>
        <span className="flex items-center justify-center gap-1 py-1 text-muted">
          <Type className="size-3" /> Text
        </span>
      </div>
      <p className="mt-2.5 rounded-md border border-line-strong bg-[#141210] px-2.5 py-1.5 font-mono text-[11px] text-fg">
        <span className="text-subtle">https://</span>
        <span className="lv-type" style={delay(200, { "--n": url.length, "--t": "0.8s" })}>
          {url}
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        {[
          ["Name", "Northwind"],
          ["Tagline", "Support that starts narrow"],
          ["Audience", "Early-stage SaaS teams"],
          ["Key terms", "workflow, first response"],
        ].map(([k, v], i) => (
          <div key={k} className="lv-rise min-w-0" style={delay(1100 + i * 140)}>
            <dt className="text-subtle">{k}</dt>
            <dd className="truncate text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex items-center gap-1.5">
        {["#ff5a1f", "#f3eee8", "#1b1815", "#3ecf8e"].map((c, i) => (
          <span key={c} className="lv-pop size-4 rounded-full ring-1 ring-white/15" style={delay(1800 + i * 90, { background: c })} />
        ))}
        <span className="lv-fade ml-auto text-[11px] text-green" style={delay(2300)}>
          Brand captured
        </span>
      </div>
    </div>
  );
}

function QualityDemo() {
  return (
    <div aria-hidden className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {SCORES.map(([k, v], i) => (
          <div key={k} className="flex flex-col items-center gap-1 text-center">
            <Ring value={v} size={44} d={i * 120} tone={v >= 90 ? "green" : "accent"}>
              <span className="text-[11px] font-semibold text-fg">{v}</span>
            </Ring>
            <span className="truncate text-[10px] leading-tight text-muted">{k.replace(" (SEO + AI search)", "")}</span>
          </div>
        ))}
      </div>
      <p className="mt-auto flex items-center justify-between border-t border-line pt-2.5 text-[12px]">
        <span className="text-muted">Overall</span>
        <span className="font-semibold text-fg">92</span>
      </p>
    </div>
  );
}

function StyleDemo() {
  return (
    <div aria-hidden className="flex h-full flex-col text-[12px]">
      <ul className="space-y-1.5">
        <li className="flex justify-between gap-2">
          <span className="text-muted">Prefer</span>
          <span className="text-fg-2">“teams” over “customers”</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-muted">Never</span>
          <span className="flex gap-1">
            {["leverage", "game-changer", "unlock"].map((w) => (
              <span key={w} className="rounded bg-red/12 px-1 text-[11px] text-red">
                {w}
              </span>
            ))}
          </span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-muted">Tone</span>
          <span className="text-fg-2">Plain, specific, first person</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-muted">Headings</span>
          <span className="text-fg-2">Sentence case</span>
        </li>
      </ul>
      <div className="mt-auto rounded-lg border border-line bg-panel-2 p-2.5">
        <p className="text-[10px] text-subtle">Editor agent · draft v2</p>
        <p className="mt-1 text-[13px] text-fg-2">
          Narrow workflows help teams <span className="lv-swap-old">leverage</span> <span className="lv-swap-new rounded bg-green/12 px-1 text-green">use</span> the data they already have.
        </p>
      </div>
    </div>
  );
}

function CalendarDemo() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  // [week, day, label, kind]
  const items: Array<[number, number, string, "update" | "analysis" | "news" | "done" | "draft"]> = [
    [0, 0, "Update", "update"],
    [0, 2, "Live", "done"],
    [0, 4, "Issue", "news"],
    [1, 0, "Update", "update"],
    [1, 3, "Report", "analysis"],
    [1, 4, "Issue", "news"],
    [2, 0, "Update", "update"],
    [2, 2, "Draft", "draft"],
    [2, 4, "Issue", "news"],
  ];
  const tone = { update: "bg-accent-tint text-accent-ink", analysis: "bg-blue/12 text-[#8db4ff]", news: "bg-white/8 text-fg-2", done: "bg-green/12 text-green", draft: "bg-amber/12 text-amber" };
  return (
    <div aria-hidden className="flex h-full flex-col">
      <div className="grid grid-cols-5 gap-1 text-center font-mono text-[9.5px] text-subtle">
        {days.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1.5 grid flex-1 grid-cols-5 grid-rows-3 gap-1">
        {Array.from({ length: 15 }, (_, cell) => {
          const w = Math.floor(cell / 5);
          const d = cell % 5;
          const it = items.find(([iw, id]) => iw === w && id === d);
          return (
            <div key={cell} className={cn("relative rounded-md border border-line p-1", w === 1 && d === 1 && "border-accent/40")}>
              {it ? (
                <span className={cn("lv-pop block truncate rounded px-1 py-0.5 text-[9px] leading-tight", tone[it[3]])} style={delay(cell * 70)}>
                  {it[3] === "draft" ? <span className="pulse-dot mr-0.5 inline-block size-1 rounded-full bg-amber align-middle" /> : null}
                  {it[2]}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex gap-3 text-[10px] text-muted">
        <span>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-accent" />
          Weekly founder update
        </span>
        <span>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-blue" />
          Industry analysis
        </span>
      </p>
    </div>
  );
}

function MemoryDemo() {
  const items = [
    ["Say “teams”, not “customers”", "From your edit on v3"],
    ["Use the pilot's 60%, never 80%", "From your email reply"],
    ["Keep customer names private", "From your first brief"],
  ];
  return (
    <div aria-hidden className="flex h-full flex-col">
      <ul className="space-y-2">
        {items.map(([k, v], i) => (
          <li key={k} className="lv-rise flex items-start gap-2.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2" style={delay(i * 160)}>
            <BookOpen className="mt-0.5 size-3.5 shrink-0 text-accent-ink" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12px] text-fg-2">{k}</span>
              <span className="block text-[10.5px] text-subtle">{v}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="lv-fade mt-auto text-[11px] text-muted" style={delay(700)}>
        Applied automatically to the next article.
      </p>
    </div>
  );
}

function VersionsDemo() {
  const v: Array<[string, string, string, "neutral" | "amber" | "blue" | "green"]> = [
    ["v1", "Writer", "First draft, 9 claims", "neutral"],
    ["v2", "Fact-checker", "80% → 60%", "amber"],
    ["v3", "Dana", "Highlight and ask: shorter", "blue"],
    ["✓", "Approved", "sha256 4f1c…9a2e", "green"],
  ];
  return (
    <div aria-hidden className="relative h-full">
      <span className="absolute top-2 bottom-6 left-[11px] w-px bg-line-strong" />
      <ul className="relative space-y-2.5">
        {v.map(([n, who, what, tone], i) => (
          <li key={n} className="lv-rise flex items-center gap-3" style={delay(i * 160)}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border bg-[#0d0b0a] font-mono text-[10px]", tone === "green" ? "border-green/40 text-green" : "border-line-strong text-fg-2")}>{n}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[12px] text-fg-2">{who}</span>
              <span className={cn("block truncate text-[11px]", tone === "green" ? "font-mono text-muted" : "text-muted")}>{what}</span>
            </span>
            {tone !== "neutral" && tone !== "green" ? <Chip tone={tone}>diff</Chip> : null}
          </li>
        ))}
      </ul>
      <History className="absolute right-0 bottom-0 size-4 text-subtle" />
    </div>
  );
}

function InsightsDemo() {
  const bars = [30, 52, 100, 74, 60, 48, 40];
  return (
    <div aria-hidden className="flex h-full flex-col">
      <p className="flex justify-between text-[11px] text-muted">
        <span>Reads per day</span>
        <span>Example</span>
      </p>
      <div className="mt-2 flex h-16 items-end gap-1">
        {bars.map((h, i) => (
          <span key={i} className="lv-grow-y flex-1 rounded-t-sm bg-accent/70" style={delay(i * 80, { height: `${h}%` })} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-[11.5px]">
        <li className="lv-rise flex gap-2" style={delay(600)}>
          <span className="text-accent-ink">Next</span>
          <span className="truncate text-fg-2">What we automated second: refunds</span>
        </li>
        <li className="lv-rise flex gap-2" style={delay(750)}>
          <span className="text-amber">Refresh</span>
          <span className="truncate text-fg-2">“Our first support hire” cites an old benchmark</span>
        </li>
        <li className="lv-rise flex gap-2" style={delay(900)}>
          <span className="text-green">AI search</span>
          <span className="truncate text-fg-2">Ready: sources, author, date</span>
        </li>
      </ul>
    </div>
  );
}

function ConnectedDemo() {
  const accts: Array<[string, string, string]> = [
    ["𝕏", "X", "@danareyes"],
    ["in", "LinkedIn", "Dana Reyes"],
    ["IG", "Instagram", "@northwind.dev"],
  ];
  return (
    <div aria-hidden className="grid h-full gap-4 sm:grid-cols-[1fr_1fr]">
      <ul className="space-y-2">
        {accts.map(([g, name, handle], i) => (
          <li key={name} className="lv-rise flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-2.5 py-2" style={delay(i * 140)}>
            <span className="flex size-7 items-center justify-center rounded-md bg-white/8 text-[11px] font-bold text-fg">{g}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[12px] text-fg">{name}</span>
              <span className="block truncate text-[10.5px] text-subtle">{handle}</span>
            </span>
            <span className="lv-pop text-[10.5px] text-green" style={delay(400 + i * 140)}>
              Connected
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden flex-col rounded-lg border border-line bg-panel-2 p-3 sm:flex">
        <p className="text-[10.5px] text-subtle">LinkedIn post · from the approved article</p>
        <p className="mt-1.5 text-[12px] leading-snug text-fg-2">Most founders try to automate all of support at once. The pilot data says start narrow.</p>
        <ol className="mt-auto space-y-1.5 text-[11px]">
          {[
            ["You approved this post", 700],
            ["Posted through your connected account", 1200],
            ["Read back by ID", 1700],
          ].map(([t, d]) => (
            <li key={t as string} className="lv-rise flex items-center gap-1.5 text-fg-2" style={delay(d as number)}>
              <Check className="size-3 text-green" /> {t}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function StudioBento() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [grid-auto-flow:dense]">
      <Tile name="Brand Voice" title="Writes the way you write" body="Learns your sentence rhythm, signature phrases, contractions, first-person habits and reading level from your blog, newsletter and posts, then scores every draft for voice match." className="md:col-span-2" demoClassName="h-auto sm:h-[250px]">
        <VoiceDemo />
      </Tile>
      <Tile name="Knowledge Base" title="Your facts, cited" body="Company facts, product details, your opinions, prior articles and approved sources. Agents pull what is relevant into research and cite it." d={80} demoClassName="h-[230px] lg:h-[250px]">
        <KnowledgeDemo />
      </Tile>
      <Tile name="Brand onboarding" title="Set up from your website" body="Paste your website, upload a company PDF or paste text. Studio captures your name, tagline, products, audience, key terms, colors, logo and voice." d={0}>
        <OnboardingDemo />
      </Tile>
      <Tile name="Highlight and ask" title="Edit by asking" body="Select a paragraph on the review page and say what you want. The new version goes back through fact-check before you can approve it." className="md:col-span-2" d={80}>
        <HighlightAskDemo />
      </Tile>
      <Tile name="Quality score" title="Six scores on every draft" body="Accuracy, sources, originality, voice match, readability, and search for both SEO and AI answers, plus an overall score." d={0}>
        <QualityDemo />
      </Tile>
      <Tile name="Style guide" title="Your words, enforced" body="Preferred terms, banned phrases, tone and formatting rules. The Editor agent applies them to every draft." d={80}>
        <StyleDemo />
      </Tile>
      <Tile name="Audience personas" title="One idea, three readers" body="The same argument adapted for investors, customers or developers, with the same sources behind each version." d={160}>
        <PersonaDemo />
      </Tile>
      <Tile name="Workflows and calendar" title="Formats you reuse" body="Save formats like a weekly founder update or an industry analysis, and plan pieces on an editorial calendar." d={0}>
        <CalendarDemo />
      </Tile>
      <Tile name="Memory" title="Tell it once" body="Edits you make and answers you give are remembered and applied to future articles." d={80}>
        <MemoryDemo />
      </Tile>
      <Tile name="Version history" title="Every version, with diffs" body="Who changed what, the review result for each version, and the exact one you approved." d={160}>
        <VersionsDemo />
      </Tile>
      <Tile name="Insights" title="What to write next" body="Views and reads on published articles, next-topic suggestions, a Refresh agent for outdated posts, and AI-search readiness." d={0}>
        <InsightsDemo />
      </Tile>
      <Tile name="Connected accounts" title="Approved posts go out on their own" body="Connect X, LinkedIn and Instagram with OAuth. Once you approve a post, it is published through your account and read back. Approval is still required for every post." className="md:col-span-2" d={80} demoClassName="h-auto sm:h-[230px]">
        <ConnectedDemo />
      </Tile>
    </ul>
  );
}
