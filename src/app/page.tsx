import Link from "next/link";
import { ArrowRight, Check, FileText, Inbox, Layers, ShieldCheck } from "lucide-react";
import { Announcement, Footer, Nav } from "@/components/chrome";
import { ArchitectureDiagram } from "@/components/landing/architecture";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ButtonLink, Chip, MonoLabel, SectionHead, cn } from "@/components/ui";

const INFRA = [
  ["AgentMail", "Inbox & replies"],
  ["Stripe", "Checkout"],
  ["Neon", "State & evidence"],
  ["Naïve", "Editorial agents"],
  ["Monid", "Research tools"],
  ["Mobile Run", "Phone checks"],
] as const;

export default function Home() {
  return (
    <>
      <Nav />
      <Announcement />
      <main className="flex-1">
        <Hero />
        <ProductShot />
        <Statement />
        <Steps />
        <Channels />
        <Infra />
        <section className="hairline-t">
          <div className="frame">
            <div className="px-4 pt-20 pb-12 md:px-12">
              <SectionHead label="Inside a review" title="Every claim, held to its source." lede="Every step is recorded in Postgres, not in an agent's memory — so retries never double-charge, double-post or lose your answer." />
            </div>
            <HowItWorks />
          </div>
        </section>
        <EvidenceSection />
        <section id="architecture" className="hairline-t scroll-mt-16">
          <div className="frame px-4 py-20 md:px-12">
            <SectionHead label="[03] Architecture" title="Built on rails that agents can't skip" lede="Payment starts fulfillment through a verified webhook. Agents return structured results the app validates. Approval is bound to a content hash and a destination." />
            <div className="panel mt-12 p-4 md:p-8">
              <ArchitectureDiagram />
            </div>
          </div>
        </section>
        <ApprovalPromise />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="glow-warm relative overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-4 pt-20 pb-16 md:px-8 md:pt-28 md:pb-24">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-2/80 uppercase">Research agent for founders</p>
        <h1 className="display mt-8 max-w-[15ch] text-fg">
          Drop in your notes.{" "}
          <span className="text-gradient">We&apos;ll write the article you&apos;d sign.</span>
        </h1>
        <div className="mt-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="max-w-lg text-lg leading-relaxed text-fg-2 md:text-xl">
            FounderDesk researches your argument, checks every claim against its source, asks you when only you know, and publishes only the version you approved.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <ButtonLink href="/start" className="px-7 py-4 text-base">
              Start an article <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <Link href="#how" className="border-b-2 border-accent pb-1 text-base font-semibold text-fg hover:text-accent-ink">
              See how it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductShot() {
  return (
    <section className="hairline-t">
      <div className="frame px-3 py-10 md:px-10 md:py-14">
        <div className="overflow-hidden rounded-xl border border-line-strong bg-[#0b0b0b] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
          <div className="grid md:grid-cols-[220px_1fr]">
            <aside className="hidden border-r border-line p-3 md:block" aria-hidden>
              <div className="mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg">
                <span className="flex size-5 items-center justify-center rounded bg-accent-tint text-[10px] text-accent-ink">N</span>
                Northwind
              </div>
              <div className="mb-4 grid grid-cols-2 rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
                <span className="rounded-md bg-white/8 py-1 text-center text-fg">Order</span>
                <span className="py-1 text-center text-muted">Evidence</span>
              </div>
              {[
                [Inbox, "Thread"],
                [Layers, "Sources"],
                [FileText, "Drafts"],
                [ShieldCheck, "Approval"],
              ].map(([Icon, label]) => {
                const I = Icon as typeof Inbox;
                return (
                  <div key={label as string} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg-2">
                    <I className="size-4 text-muted" />
                    {label as string}
                  </div>
                );
              })}
              <MonoLabel className="mt-6 mb-2 px-2">Recent</MonoLabel>
              {["Narrow support workflows", "Pricing page teardown", "Seed round lessons"].map((t, i) => (
                <div key={t} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg-2">
                  <span className={cn("size-1.5 rounded-full", i === 0 ? "bg-accent" : "bg-green")} />
                  <span className="truncate">{t}</span>
                </div>
              ))}
            </aside>
            <div className="min-w-0">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-muted md:px-6">
                <span>Why founders should start with narrow support workflows · v2</span>
                <Chip tone="accent">Ready for your approval</Chip>
              </div>
              <div className="grid gap-6 p-4 md:grid-cols-[1fr_240px] md:p-8">
                <article className="min-w-0">
                  <h3 className="text-2xl font-medium tracking-[-0.02em] text-fg">Why founders should start with narrow support workflows</h3>
                  <p className="mt-2 text-sm text-muted">What the evidence supports, where it stops, and what we learned first-hand.</p>
                  <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-fg-2">
                    <p>
                      Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60% after routing password resets and refunds to narrow workflows.
                      <sup className="ml-0.5 text-accent-ink">S1</sup>
                    </p>
                    <p>
                      Teams that automated every ticket type at once saw escalations rise.<sup className="ml-0.5 text-accent-ink">S2</sup> Start where the work is repetitive and the success metric is
                      obvious.
                    </p>
                  </div>
                  <div className="relative mt-8">
                    <div className="composer-glow absolute -top-6 left-1/2 h-8 w-3/4 -translate-x-1/2" aria-hidden />
                    <div className="relative rounded-xl border border-line-strong bg-panel-2 px-4 py-3 text-sm text-subtle">Suggest an edit — it goes back through review…</div>
                  </div>
                </article>
                <aside className="space-y-3 text-sm">
                  <MonoLabel>Sources beside claims</MonoLabel>
                  {[
                    ["S1", "Pilot report (your attachment)", "“median first-response time improved by 60%”"],
                    ["S2", "Support automation benchmark", "“escalation rates rose by 12%”"],
                  ].map(([ref, title, quote]) => (
                    <div key={ref} className="rounded-lg border border-line bg-panel-2 p-3">
                      <p className="text-xs text-accent-ink">{ref}</p>
                      <p className="mt-1 text-fg-2">{title}</p>
                      <p className="mt-1.5 text-xs text-muted">{quote}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-line bg-panel-2 p-3">
                    <p className="text-xs text-muted">Corrections</p>
                    <p className="mt-1 text-fg-2">80% → 60%, as you confirmed by email.</p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Infra() {
  return (
    <section className="hairline-t">
      <div className="frame">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-16 pb-6 md:px-6">
          <p className="text-lg text-fg">Runs on infrastructure built for agents</p>
          <Link href="#architecture" className="text-sm text-muted hover:text-fg">
            See the architecture →
          </Link>
        </div>
        <ul className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          {INFRA.map(([name, role], i) => (
            <li key={name} className={cn("flex h-28 flex-col items-center justify-center gap-1 border-line", "border-b lg:border-b-0", i % 2 === 0 ? "border-r" : "sm:border-r", "lg:border-r", i === INFRA.length - 1 ? "lg:border-r-0" : "")}>
              <span className="text-lg font-semibold tracking-[-0.02em] text-fg-2">{name}</span>
              <span className="text-xs text-subtle">{role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section className="bg-bg">
      <div className="mx-auto max-w-[1240px] px-4 py-28 md:px-8 md:py-40">
        <p className="display-md max-w-[22ch] text-fg">
          Founders don&apos;t lack ideas. They lack the hours to turn them into <span className="serif-accent text-gradient pr-1">something people trust.</span>
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", tile: "tile-1", title: "Send the idea", body: "Notes, a pilot report, a few links. Email them or paste them in. Rough is fine." },
  { n: "02", tile: "tile-2", title: "It researches and checks", body: "Sources are fetched and every number is held to its passage. When only you know the answer, it asks you by email." },
  { n: "03", tile: "tile-3", title: "You approve, it ships", body: "Read the exact text with sources beside each claim. Approve it and it's published, verified live, and checked on a phone." },
];

function Steps() {
  return (
    <section id="how" className="scroll-mt-16 bg-bg">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 pb-28 md:grid-cols-3 md:gap-6 md:px-8">
        {STEPS.map((s) => (
          <div key={s.n}>
            <div className={cn(s.tile, "flex aspect-[5/4] items-end rounded-3xl p-7")}>
              <span className="font-[family-name:var(--font-display)] text-7xl font-semibold tracking-[-0.06em] text-fg md:text-8xl">{s.n}</span>
            </div>
            <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em] text-fg md:text-3xl">{s.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type Channel = { tag: string; title: string; body: string; status: string; tone: "live" | "connect" | "planned"; style: string };
const CHANNELS: Channel[] = [
  { tag: "WEB ARTICLE", title: "A full article, with the receipts", body: "Long-form, in your voice, with a source beside every claim — published and verified live.", status: "Live", tone: "live", style: "bg-[linear-gradient(135deg,#ff5a1f,#ff8a3c)] text-[#140a05]" },
  { tag: "X", title: "A post with a real hook", body: "One idea, a strong first line, and a link back to the full article. Approved separately.", status: "Connect your account", tone: "connect", style: "bg-[linear-gradient(160deg,#2a1714,#160f0d)] text-fg" },
  { tag: "LINKEDIN", title: "Posts that sound like you", body: "The same argument for a professional feed, read back by ID before we call it published.", status: "Connect your account", tone: "connect", style: "bg-[linear-gradient(135deg,#c81f30,#e0362d)] text-fg" },
  { tag: "NEWSLETTER", title: "An issue ready to send", body: "A subject line and a tight issue that points readers to the full piece.", status: "Planned", tone: "planned", style: "bg-panel text-fg" },
  { tag: "INSTAGRAM", title: "Carousels and captions", body: "Slide-by-slide copy from the approved article.", status: "Planned", tone: "planned", style: "bg-[linear-gradient(160deg,#4a1a0e,#2a120c)] text-fg" },
];

function Channels() {
  return (
    <section className="bg-bg">
      <div className="mx-auto max-w-[1240px] px-4 pb-28 md:px-8">
        <h2 className="display-md text-fg">
          One idea. <span className="serif-accent">Every</span> channel.
        </h2>
        <p className="mt-5 max-w-xl text-lg text-muted">Each destination is approved on its own, and nothing is called published until we&apos;ve read it back.</p>
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <li key={c.tag} className={cn("flex min-h-[360px] flex-col justify-between rounded-3xl p-8", c.style)}>
              <div className="flex items-start justify-between gap-3">
                <span className="bg-white px-3 py-1.5 text-xs font-bold tracking-[0.08em] text-black">{c.tag}</span>
                <span className={cn("text-xs font-semibold", c.tone === "live" ? "text-[#140a05]" : c.tone === "connect" ? "text-fg-2" : "text-fg-2/60")}>{c.status}</span>
              </div>
              <div>
                <h3 className="text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.04em] md:text-3xl">{c.title}</h3>
                <p className={cn("mt-4 text-base leading-relaxed", c.tone === "live" ? "text-[#140a05]/80" : "text-fg-2/85")}>{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EvidenceSection() {
  const rows = [
    {
      claim: "“Response time improved by 80%.”",
      status: ["amber", "Asked the founder"] as const,
      passage: "Pilot report: “median first-response time improved by 60%”",
      outcome: "Founder confirmed 60% by email; corrected.",
    },
    {
      claim: "“This works for all companies.”",
      status: ["blue", "Narrowed"] as const,
      passage: "“Across the 42 B2B SaaS companies in the pilot…”",
      outcome: "Rewritten to the population the report studied.",
    },
    {
      claim: "Names a pilot customer.",
      status: ["accent", "Boundary"] as const,
      passage: "Brief: “Please keep the customer names private.”",
      outcome: "Replaced with “a pilot customer”.",
    },
  ];
  return (
    <section id="evidence" className="hairline-t scroll-mt-16">
      <div className="frame px-4 py-20 md:px-12">
        <SectionHead label="[02] Evidence" title="Underpinned by the passage, not the vibe" lede="The reviewer quotes the exact source passage, proposes a precise sentence, and only asks you what only you can answer." />
        <div className="panel mt-12 overflow-hidden">
          <div className="hidden grid-cols-[1.1fr_0.7fr_1.4fr_1.2fr] border-b border-line px-5 py-3 text-xs text-muted md:grid">
            <span>Claim in your notes</span>
            <span>Reviewer</span>
            <span>Source passage</span>
            <span>Outcome</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.claim} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[1.1fr_0.7fr_1.4fr_1.2fr] md:gap-4">
                <span className="text-fg">{r.claim}</span>
                <span>
                  <Chip tone={r.status[0]}>{r.status[1]}</Chip>
                </span>
                <span className="text-muted">{r.passage}</span>
                <span className="text-fg-2">{r.outcome}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-subtle">Example review of a brief with an attached pilot report.</p>
        </div>
      </div>
    </section>
  );
}

function ApprovalPromise() {
  return (
    <section className="hairline-t">
      <div className="frame px-4 py-20 md:px-12">
        <div className="panel flex flex-col items-center px-6 py-14 text-center">
          <ShieldCheck className="size-6 text-accent-ink" aria-hidden />
          <p className="mt-6 max-w-2xl text-2xl font-medium leading-snug tracking-[-0.02em] text-fg">“Nothing goes live until you approve the exact text — and if a word changes after you approve, the approval no longer counts.”</p>
          <p className="mt-5 text-sm text-muted">Approvals are stored against the draft version, its SHA-256 content hash, and the destination.</p>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const included = [
    "Research across your notes, attachments, links and the web",
    "Draft in your voice, with a source beside every claim",
    "Reviewer check with up to two automatic revision rounds",
    "Clarifying questions by email when only you know the answer",
    "Private review page with one-click approval or edits",
    "Published article, verified live and checked on a phone",
  ];
  const destinations: Array<[string, string, "green" | "neutral" | "amber"]> = [
    ["Web article", "Included", "green"],
    ["X announcement", "Connect your account", "neutral"],
    ["LinkedIn announcement", "Connect your account", "neutral"],
    ["TikTok", "Planned — needs a video step", "amber"],
  ];
  return (
    <section id="pricing" className="hairline-t scroll-mt-16">
      <div className="frame px-4 py-20 md:px-12">
        <SectionHead label="[04] Pricing" title="One article. One price." lede="A first-article price while we learn what founders need most." />
        <div className="mt-12 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="panel flex flex-col p-6 md:p-8">
            <p className="text-sm text-muted">First article</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-medium tracking-[-0.04em] text-fg">$49</span>
              <span className="text-sm text-muted">one-time</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-fg-2">
              {included.map((x) => (
                <li key={x} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap gap-2.5 pt-10">
              <ButtonLink href="/start">Start an article</ButtonLink>
              <ButtonLink href="/start#email" variant="secondary">
                Or send it by email
              </ButtonLink>
            </div>
          </div>
          <div className="panel p-6 md:p-8">
            <p className="text-sm text-muted">Where it can publish</p>
            <ul className="mt-6 divide-y divide-line">
              {destinations.map(([name, note, tone]) => (
                <li key={name} className="flex items-center justify-between gap-3 py-3.5 text-sm">
                  <span className="text-fg-2">{name}</span>
                  <Chip tone={tone}>{note}</Chip>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-subtle">Each destination is approved separately. Social posts are read back by ID before we call them published.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="glow-warm relative overflow-hidden">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center px-4 py-32 text-center md:px-8 md:py-44">
        <h2 className="display max-w-[16ch] text-fg">Your notes are already the first draft.</h2>
        <p className="mt-6 max-w-md text-lg text-fg-2">Send them over. Approve the exact text. We handle everything in between.</p>
        <div className="mt-10">
          <ButtonLink href="/start" className="px-8 py-4 text-base">
            Start an article <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
