import { Check, CornerDownLeft, FileText, Globe, Link2, Mail, Paperclip, RefreshCw, Smartphone, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, cn } from "../ui";
import { Cite, Meter, Ring, Window, delay } from "./mock";

/*
 * Mock UI for each step of the guided tour. Every animated element uses the
 * one-shot lv-* classes, which are held by the .lv-gate class on inactive
 * panels and play from the start when the panel becomes active.
 */

function Row({ children, d, className }: { children: ReactNode; d: number; className?: string }) {
  return (
    <div className={cn("lv-rise", className)} style={delay(d)}>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-line bg-panel-2 p-3", className)}>{children}</div>;
}

export function NotesPanel() {
  return (
    <Window title="Inbox · desk@founderdesk.app" right={<Chip tone="green">Thread linked to order</Chip>}>
      <Row d={0}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">D</span>
          <div className="min-w-0 text-[12px] leading-tight">
            <p className="text-fg">Dana Reyes</p>
            <p className="truncate text-subtle">dana@northwind.dev → desk@founderdesk.app</p>
          </div>
          <span className="ml-auto font-mono text-[11px] text-subtle">09:12</span>
        </div>
        <p className="mt-3 text-sm font-medium text-fg">Article idea: start with narrow support workflows</p>
      </Row>
      <Row d={150}>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          We tried automating all of support at once and it backfired. Narrow workflows cut our response time{" "}
          <span className="lv-mark px-0.5 text-amber" style={delay(900)}>
            80%
          </span>
          . Audience is early-stage SaaS founders. Please keep the customer names private.
        </p>
      </Row>
      <Row d={320} className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-2 py-1 text-fg-2">
          <Paperclip className="size-3" aria-hidden /> pilot-report.pdf
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-2 py-1 text-fg-2">
          <Link2 className="size-3" aria-hidden /> support benchmark
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-2 py-1 text-fg-2">
          <Link2 className="size-3" aria-hidden /> help-center teardown
        </span>
      </Row>
      <p className="mono-label lv-fade mt-5 mb-2 text-[11px]" style={delay(700)}>
        Brief, as the desk read it
      </p>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        {[
          ["Topic", "Narrow support workflows", "neutral"],
          ["Audience", "Early-stage SaaS founders", "neutral"],
          ["Boundary", "Customer names stay private", "accent"],
          ["To check", "3 claims, 1 figure", "amber"],
        ].map(([k, v, tone], i) => (
          <Row key={k} d={900 + i * 140}>
            <Card className="p-2.5">
              <p className={cn("text-[11px]", tone === "accent" ? "text-accent-ink" : tone === "amber" ? "text-amber" : "text-muted")}>{k}</p>
              <p className="mt-0.5 text-fg-2">{v}</p>
            </Card>
          </Row>
        ))}
      </div>
    </Window>
  );
}

export function VoicePanel() {
  const traits: Array<[string, string, number]> = [
    ["Sentence rhythm", "Short, 13 words", 68],
    ["Contractions", "Often", 82],
    ["First person", "We, then I", 64],
    ["Reading level", "Grade 8", 44],
  ];
  const items: Array<[string, string]> = [
    ["Company fact", "Northwind ran a support pilot with 42 B2B SaaS companies"],
    ["Opinion", "Automate the most boring ticket first"],
    ["Prior article", "“Our first support hire”"],
    ["Approved source", "pilot-report.pdf"],
  ];
  return (
    <Window title="Studio · loaded for this order" right={<Chip tone="green">2 profiles attached</Chip>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="text-[12px] text-fg">Brand Voice</p>
          <p className="text-[11px] text-subtle">Learned from Dana&apos;s blog, newsletter and posts</p>
          <ul className="mt-3 space-y-2.5">
            {traits.map(([k, v, n], i) => (
              <li key={k} className="lv-rise" style={delay(150 + i * 120)}>
                <span className="mb-1 flex justify-between text-[11px]">
                  <span className="text-muted">{k}</span>
                  <span className="text-fg-2">{v}</span>
                </span>
                <Meter value={n} d={250 + i * 120} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Signature phrases</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["start boring", "one number", "we got this wrong"].map((p, i) => (
              <span key={p} className="lv-pop rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] text-accent-ink" style={delay(800 + i * 120)}>
                “{p}”
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-[12px] text-fg">Knowledge Base</p>
          <p className="text-[11px] text-subtle">Relevant items pulled into research</p>
          <ul className="mt-3 space-y-2">
            {items.map(([k, v], i) => (
              <li key={k} className="lv-rise flex items-start gap-2 rounded-md border border-line bg-[#0d0b0a] p-2" style={delay(500 + i * 220)}>
                <span className="mt-px font-mono text-[10px] text-accent-ink">K{i + 1}</span>
                <span className="min-w-0 text-[12px] leading-snug">
                  <span className="block text-[10px] text-subtle">{k}</span>
                  <span className="text-fg-2">{v}</span>
                </span>
                <Check className="lv-pop ml-auto size-3.5 shrink-0 text-green" style={delay(800 + i * 220)} aria-hidden />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Window>
  );
}

export function ResearchPanel() {
  const rows: Array<[string, string, string, string, boolean]> = [
    ["S1", "pilot-report.pdf", "Attachment", "p.4 “median first-response time improved by 60%”", true],
    ["S2", "Support automation benchmark 2026", "Monid search", "“escalation rates rose by 12%”", true],
    ["S3", "Help-center teardown", "Founder link", "Routing examples for resets and refunds", true],
    ["S4", "Vendor landing page", "Monid search", "No usable passage. Not cited.", false],
  ];
  return (
    <Window title="Researcher · budget 8 searches, 8 pages" right={<Chip tone="accent">Researching</Chip>}>
      <ul className="divide-y divide-line">
        {rows.map(([ref, title, kind, result, kept], i) => {
          const d = 200 + i * 650;
          return (
            <li key={ref} className="lv-rise py-3 first:pt-0" style={delay(d)}>
              <div className="flex items-center gap-3 text-[13px]">
                <span className={cn("w-6 font-mono text-[11px]", kept ? "text-accent-ink" : "text-subtle")}>{ref}</span>
                <span className="min-w-0 flex-1 truncate text-fg-2">{title}</span>
                <span className="hidden text-[11px] text-subtle sm:inline">{kind}</span>
                <span className="lv-pop" style={delay(d + 650)}>
                  <Chip tone={kept ? "green" : "neutral"}>{kept ? "Kept" : "Dropped"}</Chip>
                </span>
              </div>
              <div className="mt-2 pl-9">
                <span className="block h-1 overflow-hidden rounded-full bg-white/6">
                  <span className={cn("lv-grow-x block h-full rounded-full", kept ? "bg-green/60" : "bg-white/20")} style={delay(d + 100, { animationDuration: "0.6s" })} />
                </span>
                <p className={cn("lv-fade mt-1.5 text-[12px]", kept ? "text-muted" : "text-subtle")} style={delay(d + 650)}>
                  {result}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="lv-fade mt-3 border-t border-line pt-3 text-[12px] text-muted" style={delay(2900)}>
        3 kept, 1 dropped. A source is kept only when a real passage supports a claim.
      </p>
    </Window>
  );
}

export function CheckPanel() {
  return (
    <Window title="Fact-checker · draft v1" right={<Chip tone="amber">Needs founder input</Chip>}>
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-2.5">
          <Row d={100}>
            <div className="rounded-lg border border-amber/30 bg-amber/[0.06] p-3">
              <p className="text-[11px] font-medium text-amber">Figure mismatch · blocking</p>
              <p className="mt-1.5 text-[13px] text-fg">“Narrow workflows cut our response time 80%.”</p>
              <p className="mt-2 border-l-2 border-white/15 pl-2.5 text-[12px] text-muted">
                Pilot report <span className="text-accent-ink">S1</span>: “median first-response time improved by 60%”
              </p>
            </div>
          </Row>
          <Row d={800}>
            <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-[12px] leading-snug text-fg-2">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] text-subtle">
                <Mail className="size-3" aria-hidden /> FounderDesk → Dana
              </p>
              Your notes say 80%. The pilot report says 60%. Is there another source, or should we use 60%?
            </div>
          </Row>
          <Row d={1600} className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-[#262320] p-2.5 text-[12px] leading-snug text-fg">
              <p className="mb-1 text-[10px] text-subtle">Dana → FounderDesk</p>
              Use 60%. The 80% was one team.
            </div>
          </Row>
        </div>
        <div className="space-y-2">
          <p className="mono-label lv-fade text-[11px]" style={delay(2100)}>
            Resolved
          </p>
          {[
            ["amber", "Figure", "80%", "60%, as Dana confirmed"],
            ["blue", "Scope", "all companies", "the 42 B2B SaaS companies in the pilot"],
            ["accent", "Boundary", "a named customer", "“a pilot customer”"],
          ].map(([tone, k, from, to], i) => (
            <Row key={k} d={2300 + i * 350}>
              <Card className="p-2.5">
                <Chip tone={tone as "amber" | "blue" | "accent"}>{k}</Chip>
                <p className="mt-1.5 text-[12px] leading-snug">
                  <span className="lv-strike text-subtle" style={delay(2600 + i * 350)}>
                    {from}
                  </span>{" "}
                  <span className="text-fg">→ {to}</span>
                </p>
              </Card>
            </Row>
          ))}
        </div>
      </div>
    </Window>
  );
}

export function EditPanel() {
  const ask = "Shorter. Say teams, not customers.";
  return (
    <Window title="Review · draft v2" right={<Chip tone="accent">Dana is editing</Chip>}>
      <p className="text-[13px] leading-relaxed text-fg-2">
        Most founders try to automate every support ticket at once.{" "}
        <span className="lv-mark text-fg" style={delay(300)}>
          In the pilot, the customers who started with password resets and refunds saw median first-response time improve by 60%, and their own customers noticed.
        </span>
        <Cite>S1</Cite>
      </p>
      <div className="lv-rise mt-3 flex items-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-3 py-2" style={delay(1000)}>
        <span className="relative flex min-w-0 flex-1 items-center overflow-hidden text-[12.5px] text-fg">
          <span className="lv-type font-mono text-[12px]" style={delay(1300, { "--n": ask.length, "--t": "1.4s" })}>
            {ask}
          </span>
          <span aria-hidden className="lv-caret ml-px inline-block h-3.5 w-px shrink-0 bg-accent" />
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-[#140a05]">
          <CornerDownLeft className="size-3.5" aria-hidden />
        </span>
      </div>
      <Row d={3200} className="mt-3">
        <Card>
          <p className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
            <span>v3 · your edit</span>
            <span className="font-mono text-subtle">−21 words</span>
          </p>
          <p className="text-[12.5px] leading-relaxed">
            <span className="text-subtle line-through decoration-red/60">the customers who started with password resets and refunds saw median first-response time improve by 60%, and their own customers noticed.</span>{" "}
            <span className="rounded bg-green/12 px-1 text-green">teams that started with resets and refunds cut median first-response time by 60%.</span>
          </p>
        </Card>
      </Row>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="lv-pop" style={delay(3900)}>
          <Chip tone="blue">Back through fact-check</Chip>
        </span>
        <span className="lv-pop" style={delay(4700)}>
          <Chip tone="green">
            <Check className="size-3" aria-hidden /> S1 still supports 60%
          </Chip>
        </span>
        <span className="lv-pop" style={delay(5400)}>
          <Chip>Remembered: say “teams”</Chip>
        </span>
      </div>
    </Window>
  );
}

export const SCORES: Array<[string, number]> = [
  ["Accuracy", 98],
  ["Sources", 95],
  ["Originality", 87],
  ["Voice match", 93],
  ["Readability", 91],
  ["Search (SEO + AI search)", 88],
];

export function ScorePanel() {
  return (
    <Window title="Quality score · draft v3" right={<Chip tone="green">Ready to approve</Chip>}>
      <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
        <div className="lv-pop flex flex-col items-center gap-2" style={delay(100)}>
          <Ring value={92} size={128} stroke={2.6} d={200}>
            <span className="text-center">
              <span className="block text-4xl font-semibold tracking-[-0.04em] text-fg">92</span>
              <span className="block text-[10px] text-muted">overall</span>
            </span>
          </Ring>
        </div>
        <ul className="space-y-3">
          {SCORES.map(([k, v], i) => (
            <li key={k} className="lv-rise" style={delay(200 + i * 110)}>
              <span className="mb-1 flex justify-between text-[12px]">
                <span className="text-fg-2">{k}</span>
                <span className="font-mono text-fg">{v}</span>
              </span>
              <Meter value={v} d={300 + i * 110} tone={v >= 90 ? "green" : "accent"} />
            </li>
          ))}
        </ul>
      </div>
      <Row d={1300} className="mt-4">
        <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] text-muted">
          <span className="text-fg-2">Search:</span> add one question-style subhead so AI answers can quote the 60% finding with its source.
        </p>
      </Row>
    </Window>
  );
}

export function ApprovePanel() {
  return (
    <Window title="founderdesk.app/review · private" right={<span className="font-mono text-[11px] text-subtle">v3</span>}>
      <Row d={0}>
        <p className="text-lg font-medium tracking-[-0.02em] text-fg">Why founders should start with narrow support workflows</p>
      </Row>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
        {[
          ["Version", "v3, your edit included"],
          ["Content hash", "sha256 4f1c2b…e19a2e"],
          ["Fact-check", "Passed, 0 open issues"],
          ["Destinations", "Web, newsletter, X, LinkedIn"],
        ].map(([k, v], i) => (
          <Row key={k} d={150 + i * 120} className="border-b border-line pb-2">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className={cn("mt-0.5 text-fg-2", k === "Content hash" && "font-mono text-[11px]")}>{v}</dd>
          </Row>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="lv-stack" style={{ display: "inline-grid" }}>
          <span className="inline-flex items-center gap-1.5 bg-accent px-4 py-2 text-sm font-semibold text-[#140a05]">
            <Check className="size-4" aria-hidden /> Approve v3
          </span>
          <span className="lv-fade inline-flex items-center justify-center gap-1.5 bg-green px-4 py-2 text-sm font-semibold text-[#06140d]" style={delay(1500)}>
            <Check className="size-4" aria-hidden /> Approved
          </span>
        </span>
        <span className="lv-fade text-[12px] text-muted" style={delay(1800)}>
          by Dana at 10:42, bound to <span className="font-mono text-fg-2">4f1c…9a2e</span>
        </span>
      </div>
      <Row d={2400} className="mt-4">
        <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
          Change one word and this becomes v4. It goes back through fact-check, and this approval no longer counts.
        </p>
      </Row>
    </Window>
  );
}

export function PublishPanel() {
  const glyph = (t: string) => <span className="flex size-4 items-center justify-center text-[11px] font-bold text-muted">{t}</span>;
  const rows: Array<[ReactNode, string, string]> = [
    [<Globe key="g" className="size-4 text-muted" aria-hidden />, "Web article", "Fetched back · 200 · hash matches"],
    [<Smartphone key="s" className="size-4 text-muted" aria-hidden />, "Phone check, Mobile Run", "Headline visible · sources linked"],
    [<FileText key="w" className="size-4 text-muted" aria-hidden />, "WordPress", "Published to northwind.dev/blog"],
    [glyph("in"), "LinkedIn post", "Connected account · read back by ID"],
    [glyph("𝕏"), "X thread, 4 posts", "Connected account · read back by ID"],
    [<Mail key="m" className="size-4 text-muted" aria-hidden />, "Newsletter", "Ready to send: “The 60% fix we almost skipped”"],
  ];
  return (
    <Window title="Publishing v3 · sha256 4f1c…9a2e" right={<Chip tone="green">Verified</Chip>}>
      <ul className="space-y-1.5">
        {rows.map(([icon, name, done], i) => {
          const d = 150 + i * 420;
          return (
            <li key={name} className="lv-rise grid grid-cols-[28px_1fr_auto] items-center gap-x-3 rounded-lg border border-line bg-panel-2 px-3 py-2" style={delay(d)}>
              <span aria-hidden>{icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-fg">{name}</span>
                <span className="relative mt-1 block h-4">
                  <span className="absolute inset-x-0 top-1.5 block h-1 overflow-hidden rounded-full bg-white/6">
                    <span className="lv-grow-x block h-full rounded-full bg-accent/60" style={delay(d + 100, { animationDuration: "0.55s" })} />
                  </span>
                  <span className="lv-fade absolute inset-0 truncate bg-panel-2 text-[11.5px] text-muted" style={delay(d + 650)}>
                    {done}
                  </span>
                </span>
              </span>
              <span className="lv-pop flex size-5 items-center justify-center rounded-full bg-green/15 text-green" style={delay(d + 650)}>
                <Check className="size-3" aria-hidden />
              </span>
            </li>
          );
        })}
      </ul>
    </Window>
  );
}

export function InsightsPanel() {
  const bars = [22, 64, 100, 78, 56, 48, 41];
  return (
    <Window title="Insights · narrow support workflows" right={<Chip>Example data</Chip>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="flex items-center justify-between text-[12px]">
            <span className="text-fg">Reads, first 7 days</span>
            <TrendingUp className="size-3.5 text-green" aria-hidden />
          </p>
          <div className="mt-3 flex h-24 items-end gap-1.5" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className="lv-grow-y flex-1 rounded-t bg-accent/70" style={delay(150 + i * 90, { height: `${h}%` })} />
            ))}
          </div>
          <p className="mt-2 flex justify-between font-mono text-[10px] text-subtle">
            <span>Mon</span>
            <span>Sun</span>
          </p>
          <p className="mt-3 text-[11px] text-muted">AI-search readiness</p>
          <ul className="mt-1.5 space-y-1 text-[12px]">
            {[
              ["Sources linked beside claims", true],
              ["Author and date marked up", true],
              ["Question-style subheads", false],
            ].map(([k, ok], i) => (
              <li key={k as string} className="lv-rise flex items-center gap-2" style={delay(800 + i * 120)}>
                <span className={cn("size-1.5 rounded-full", ok ? "bg-green" : "bg-amber")} />
                <span className={ok ? "text-fg-2" : "text-amber"}>{k as string}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-2.5">
          <Row d={600}>
            <Card>
              <p className="text-[11px] text-muted">Next topic · Performance analyst</p>
              <p className="mt-1 text-[13px] text-fg">What we automated second: refunds</p>
              <p className="mt-1 text-[11px] text-subtle">Readers spent the longest on the refunds paragraph. Idea Lab has 6 hooks ready to score.</p>
            </Card>
          </Row>
          <Row d={950}>
            <Card>
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <RefreshCw className="size-3" aria-hidden /> Refresh analyst
              </p>
              <p className="mt-1 text-[13px] text-fg">“Our first support hire” cites last year&apos;s benchmark</p>
              <p className="mt-1 text-[11px] text-subtle">A newer edition exists. Draft an update?</p>
            </Card>
          </Row>
          <Row d={1300}>
            <Card className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-fg-2">Memory: 2 preferences saved for the next article</span>
              <span className="text-[11px] text-accent-ink">View</span>
            </Card>
          </Row>
        </div>
      </div>
    </Window>
  );
}
