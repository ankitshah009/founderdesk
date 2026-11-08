import Link from "next/link";
import { RotatingHeadline } from "@/components/landing/rotating-headline";
import { ArrowRight, Check } from "lucide-react";
import { Announcement, Footer, Nav } from "@/components/chrome";
import { AgentCards, AgentPipeline } from "@/components/landing/agents";
import { ChannelFanout, Destinations } from "@/components/landing/channels";
import { Comparison } from "@/components/landing/comparison";
import { Faq } from "@/components/landing/faq";
import { HeroDemo } from "@/components/landing/hero-demo";
import { IdeaLab } from "@/components/landing/idea-lab";
import { IntegrationMarquee } from "@/components/landing/marquee";
import { delay } from "@/components/landing/mock";
import { RevealObserver } from "@/components/landing/reveal";
import { StudioBento } from "@/components/landing/studio-bento";
import { Tutorial } from "@/components/landing/tutorial";
import { UseCases } from "@/components/landing/use-cases";
import { ButtonLink, Chip, SectionHead, cn } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Nav />
      <Announcement />
      <main className="flex-1">
        <Hero />
        <Stack />
        <Section id="how" label="[01] Guided tour" title="See one article go through the desk" lede="Follow Dana's article on narrow support workflows from rough notes to a verified page. It plays on its own. Pause it any time, or pick a step.">
          <Tutorial />
        </Section>
        <Section
          id="agents"
          label="[02] Agent desk"
          title="An agent desk works every article"
          lede="Researcher, Writer, Fact-checker, Editor and Reviewer pass one draft along, each with a narrow job. Analysts and agents you configure keep work coming on a schedule."
        >
          <div data-reveal="">
            <AgentPipeline />
          </div>
          <AgentCards />
        </Section>
        <Section
          id="features"
          label="[03] Studio"
          title="The Studio is where the desk learns how you work"
          lede="Teach it once: how you write, what is true about your company, which words you never use. Every agent reads from the same place."
          action={
            <ButtonLink href="/studio" variant="secondary">
              Open the Studio <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          }
        >
          <StudioBento />
        </Section>
        <Section
          id="idea-lab"
          label="[04] Idea Lab"
          title="Test an idea before you write it"
          lede="Idea Lab learns from viral posts captured across social media and from your own post history. Six tools help you pick the idea, the hook and the week, and check surprising claims first."
        >
          <div data-reveal="">
            <IdeaLab />
          </div>
          <p className="mt-3 text-xs text-subtle">Predictions are estimates from your own history and comparable posts, not guarantees.</p>
        </Section>
        <Evidence />
        <Section
          id="channels"
          label="[06] Every channel"
          title="One idea, written for every channel"
          lede="The approved article becomes a newsletter, an X thread, a LinkedIn post and an Instagram carousel. Each version is approved on its own, and nothing counts as published until we have read it back."
        >
          <div data-reveal="">
            <ChannelFanout />
          </div>
          <p className="mono-label mt-14 mb-4">Publish anywhere</p>
          <Destinations />
        </Section>
        <Section id="use-cases" label="[07] Use cases" title="What founders publish with it" lede="Pick your industry, the kind of founder you are, or your stage.">
          <div data-reveal="">
            <UseCases />
          </div>
        </Section>
        <Section
          id="compare"
          label="[08] Compare"
          title="What you won't find in other tools"
          lede="Most AI writing tools offer brand voice, a knowledge base and workflows. FounderDesk adds proof: sources for every claim, approval of the exact version, and a verified page."
        >
          <Comparison />
        </Section>
        {/* Testimonials stay hidden until there are real, permissioned quotes (see testimonials-data.ts). */}
        <Pricing />
        <Section id="faq" label="[10] FAQ" title="Questions founders ask">
          <Faq />
        </Section>
        <FinalCta />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}

function Section({ id, label, title, lede, action, children }: { id: string; label: string; title: string; lede?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="hairline-t scroll-mt-16">
      <div className="frame px-4 py-20 md:px-12 md:py-24">
        <div data-reveal="" className="lv-balance mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHead label={label} title={title} lede={lede} />
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="frame px-4 pt-14 pb-12 md:px-12 md:pt-24 md:pb-16">
        <Link href="/studio" className="lv-rise group inline-flex max-w-full items-center gap-2.5 rounded-full border border-line py-1 pr-3 pl-1 text-[13px] text-fg-2 transition-colors hover:border-line-strong">
          <Chip tone="accent" className="rounded-full">
            New
          </Chip>
          <span className="truncate">The Studio: your voice, facts and agents in one place</span>
          <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <RotatingHeadline className="display lv-rise mt-8 text-fg" style={delay(80)} />
        <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="lv-rise max-w-lg text-lg leading-relaxed text-fg-2" style={delay(160)}>
            Drop in your notes, a voice memo or just your website. Get a researched article in your voice with every claim sourced, plus posts for X, LinkedIn, Instagram and your newsletter. Nothing goes live until you approve it. Your first article is free.
          </p>
          <div className="lv-rise flex flex-col gap-3" style={delay(240)}>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/start" className="px-6 py-3.5 text-base">
                Start free <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/studio" variant="secondary" className="px-6 py-3.5 text-base">
                Open the Studio
              </ButtonLink>
            </div>
            <p className="text-xs text-muted">First article free, then $9 each.</p>
          </div>
        </div>
      </div>
      <div className="frame px-3 pb-16 md:px-10 md:pb-20">
        <div className="lv-rise" style={delay(320)}>
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

function Stack() {
  return (
    <section id="stack" className="hairline-t scroll-mt-16">
      <div className="frame">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-10 pb-5 md:px-6">
          <p className="text-[15px] text-fg">Runs on infrastructure built for agents, and publishes where your readers are</p>
          <Link href="/status" className="text-sm text-muted hover:text-fg">
            Integration status →
          </Link>
        </div>
      </div>
      <IntegrationMarquee className="border-t border-line" />
    </section>
  );
}

const EVIDENCE = [
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

const PROMISES = [
  { k: "Every claim", v: "checked against the passage it cites before you see the draft" },
  { k: "1 question, max", v: "asked only when your number conflicts with a source" },
  { k: "30 minutes", v: "is the longest an order waits on you before continuing safely" },
  { k: "Word for word", v: "your approval covers the exact text and its SHA-256 hash; any edit is reviewed again" },
];

function Evidence() {
  return (
    <Section id="evidence" label="[05] Evidence" title="Underpinned by the passage, not the vibe" lede="The fact-checker quotes the exact source passage, proposes a precise sentence, and only asks you what only you can answer.">
      <div data-reveal="" className="panel overflow-hidden">
        <div className="hidden grid-cols-[1.1fr_0.7fr_1.4fr_1.2fr] gap-4 border-b border-line px-5 py-3 text-xs text-muted md:grid">
          <span>Claim in your notes</span>
          <span>Fact-checker</span>
          <span>Source passage</span>
          <span>Outcome</span>
        </div>
        <ul className="divide-y divide-line">
          {EVIDENCE.map((r, i) => (
            <li key={r.claim} className="lv-rise grid gap-2 px-5 py-4 text-sm transition-colors hover:bg-white/[0.02] md:grid-cols-[1.1fr_0.7fr_1.4fr_1.2fr] md:gap-4" style={delay(150 + i * 160)}>
              <span className="text-fg">{r.claim}</span>
              <span className="lv-pop" style={delay(350 + i * 160)}>
                <Chip tone={r.status[0]}>{r.status[1]}</Chip>
              </span>
              <span className="text-muted">{r.passage}</span>
              <span className="text-fg-2">{r.outcome}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-3 text-xs text-subtle">Example review of a brief with an attached pilot report.</p>
      </div>
      <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {PROMISES.map((p, i) => (
          <div key={p.k} data-reveal="" style={delay(i * 80)} className="bg-bg p-5">
            <dt className="text-xl font-semibold tracking-[-0.03em] text-fg">{p.k}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{p.v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Pricing() {
  const included = [
    "Research across your notes, attachments, links and the web",
    "Draft in your voice, with a source beside every claim",
    "Fact-check with up to two automatic revision rounds",
    "Clarifying questions by email when only you know the answer",
    "Private review page with highlight-and-ask edits and one-click approval",
    "Published article, verified live and checked on a phone",
  ];
  const extras: Array<[string, string, "green" | "neutral" | "accent"]> = [
    ["Images", "10 credits for $5", "accent"],
    ["Web article", "Included", "green"],
    ["Newsletter, X, LinkedIn, Instagram", "Written with the article", "green"],
    ["WordPress, Ghost, Webflow", "Connect your site", "neutral"],
  ];
  return (
    <Section id="pricing" label="[09] Pricing" title="One article. One price." lede="Try it free. Confirm your email and your first researched, fact-checked article is on us.">
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div data-reveal="" className="panel flex flex-col p-6 md:p-8">
          <p className="text-sm text-muted">Your first article is free</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-5xl font-medium tracking-[-0.04em] text-fg">$9</span>
            <span className="text-sm text-muted">per article after that</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-fg-2">
            {included.map((x, i) => (
              <li key={x} className="lv-rise flex gap-2.5" style={delay(150 + i * 70)}>
                <Check className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap gap-2.5 pt-10">
            <ButtonLink href="/start">
              Start an article <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/start#email" variant="secondary">
              Or send it by email
            </ButtonLink>
          </div>
        </div>
        <div data-reveal="" style={delay(100)} className="panel flex flex-col p-6 md:p-8">
          <p className="text-sm text-muted">Add-ons and publishing</p>
          <ul className="mt-6 divide-y divide-line">
            {extras.map(([name, note, tone]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-3.5 text-sm">
                <span className="text-fg-2">{name}</span>
                <Chip tone={tone} className="shrink-0">
                  {note}
                </Chip>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-subtle">Each destination is approved separately. Social posts are read back by ID before we call them published.</p>
        </div>
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="hairline-t relative overflow-hidden">
      <div className="grid-floor opacity-60" aria-hidden />
      <div data-reveal="" className="frame relative flex flex-col items-center px-4 py-28 text-center md:py-40">
        <h2 className="display-md max-w-[16ch] text-fg">Your notes are already the first draft.</h2>
        <p className="mt-6 max-w-md text-lg text-fg-2">Send them over. Approve the exact text. We handle everything in between.</p>
        <div className={cn("mt-10 flex flex-wrap justify-center gap-3")}>
          <ButtonLink href="/start" className="px-7 py-3.5 text-base">
            Start an article <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/studio" variant="secondary" className="px-7 py-3.5 text-base">
            Open the Studio
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
