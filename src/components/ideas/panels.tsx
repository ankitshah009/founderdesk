import Link from "next/link";
import { ArrowUpRight, Check, Crown, Plus, X } from "lucide-react";
import { addOwnHook, chooseHook, removeHook } from "@/app/studio/ideas/actions";
import { Button, ButtonLink, Chip, cn, inputClass } from "@/components/ui";
import type { Idea } from "@/lib/db/schema";
import { FEATURES, type Analog, type ClaimCheck, type PostRow, type Reaction, type Tournament, type TwinPrediction } from "@/lib/studio/ideas";
import { PLATFORM_LABEL } from "./capture-helpers";
import { Panel, Pct, RingGauge, Track, excerpt, ord, toneFor } from "./viz";

const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

function ImportCta({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-accent/40 bg-accent-tint p-6">
      <p className="text-sm text-fg">{children}</p>
      <ButtonLink href="/studio/ideas/library#import" className="mt-4">
        Import posts
      </ButtonLink>
    </div>
  );
}

function PostLine({ post, percentile, sim }: { post: PostRow; percentile: number; sim?: number }) {
  return (
    <li className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          {post.author === "me" ? "You" : post.author} · {PLATFORM_LABEL[post.platform]}
          {sim != null ? ` · ${Math.round(sim * 100)}% similar` : ""}
        </span>
        <Pct value={percentile} />
      </div>
      <p className="mt-1.5 text-sm text-fg-2">{excerpt(post.text, 140)}</p>
    </li>
  );
}

/* ── 1. Viral Twin ───────────────────────────────────────────────────── */

export function ViralTwinPanel({ twin }: { twin: TwinPrediction }) {
  if (twin.status === "no_data") {
    return (
      <Panel id="twin" n="01" title="Viral Twin Simulator" kicker="How would this land with your audience?">
        <ImportCta>{twin.message}</ImportCta>
      </Panel>
    );
  }
  const confTone = twin.confidence === "high" ? "green" : twin.confidence === "medium" ? "amber" : "neutral";
  return (
    <Panel
      id="twin"
      n="01"
      title="Viral Twin Simulator"
      kicker={`Predicted ${ord(twin.percentile)} percentile of your posts`}
      lede="Where this idea would rank among your own posts, estimated from its nearest twins and the hook patterns your audience rewards."
      aside={<Chip tone={confTone}>{twin.confidence} confidence</Chip>}
    >
      <div className="grid gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <RingGauge value={twin.percentile} range={twin.range} label={ord(twin.percentile)} sub="percentile" />
          <p className="text-xs text-muted">
            Likely range {ord(twin.range[0])}–{ord(twin.range[1])}
          </p>
        </div>
        <div className="min-w-0 space-y-5">
          <div>
            <div className="mb-2 flex justify-between text-[11px] text-subtle">
              <span>Your weakest post</span>
              <span>Median</span>
              <span>Your best post</span>
            </div>
            <div className="relative">
              <Track value={twin.percentile} band={twin.range} className="h-2" />
              <div className="absolute top-[-3px] left-1/2 h-3.5 w-px bg-white/30" aria-hidden />
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-2xl font-semibold tracking-[-0.03em] text-fg tabular-nums">{twin.expectedLikes != null ? twin.expectedLikes.toLocaleString("en-US") : "—"}</p>
              <p className="text-xs text-muted">{twin.expectedLikes != null ? "expected likes" : "expected likes (needs 5+ of your posts on this platform)"}</p>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-fg-2">
            {twin.explanation.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <p className="mono-label">Nearest of your posts</p>
          <ul className="mt-3 space-y-2">
            {twin.own.map((x) => (
              <PostLine key={x.post.id} post={x.post} percentile={x.percentile} sim={x.sim} />
            ))}
            {!twin.own.length ? <li className="text-sm text-muted">None of your posts are close to this idea.</li> : null}
          </ul>
        </div>
        <div>
          <p className="mono-label">Nearest creator posts</p>
          <ul className="mt-3 space-y-2">
            {twin.creators.map((x) => (
              <PostLine key={x.post.id} post={x.post} percentile={x.percentile} sim={x.sim} />
            ))}
            {!twin.creators.length ? (
              <li className="text-sm text-muted">
                Nothing similar in your swipe file.{" "}
                <Link href="/studio/ideas/library#capture" className="text-accent-ink hover:text-accent">
                  Capture a few creator posts
                </Link>
                .
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

/* ── 2. Audience panel ───────────────────────────────────────────────── */

export function AudiencePanel({ panel }: { panel: { reactions: Reaction[]; hookIssues: string[]; weakPoints: string[] } }) {
  return (
    <Panel
      id="audience"
      n="02"
      title="Audience Reaction Panel"
      kicker="How your personas react"
      lede="A simulated panel built from the personas in your profile. It reads the idea for what each persona cares about and avoids; it's not a survey of real people."
      aside={<Chip tone="blue">Simulated panel</Chip>}
    >
      {panel.reactions.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panel.reactions.map((r, i) => {
            const tone = r.verdict === "Leans in" ? "green" : r.verdict === "Scrolls past" ? "red" : "amber";
            return (
              <li key={r.persona.id} className="lv-rise flex flex-col rounded-2xl border border-line bg-panel-2 p-5" style={d(i * 90)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-fg" aria-hidden>
                      {r.persona.name.slice(0, 1)}
                    </span>
                    <p className="font-semibold text-fg">{r.persona.name}</p>
                  </div>
                  <Chip tone={tone}>{r.verdict}</Chip>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>Interest</span>
                    <span className="tabular-nums">{Math.round(r.interest)}/100</span>
                  </div>
                  <Track value={r.interest} delay={i * 90 + 200} />
                </div>
                {r.objections.length ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-fg-2">Objections</p>
                    <ul className="mt-1.5 space-y-1.5 text-sm text-muted">
                      {r.objections.map((o) => (
                        <li key={o} className="border-l-2 border-red/40 pl-2.5">
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4">
                  <p className="text-xs font-medium text-fg-2">They&apos;d ask</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-muted">
                    {r.questions.map((q) => (
                      <li key={q} className="border-l-2 border-blue/40 pl-2.5">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No personas yet.{" "}
          <Link href="/studio/brand" className="text-accent-ink hover:text-accent">
            Add your audiences in the Studio
          </Link>{" "}
          to see how each reacts.
        </p>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <IssueList title="Hook issues" items={panel.hookIssues} empty="The hook has a clear reason to stop scrolling." />
        <IssueList title="Weak points" items={panel.weakPoints} empty="No hedged, sweeping or unsourced claims found." />
      </div>
    </Panel>
  );
}

function IssueList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="mono-label">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-fg-2">
          {items.map((x) => (
            <li key={x} className="flex gap-2">
              <X className="mt-0.5 size-4 shrink-0 text-red" aria-hidden />
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex gap-2 text-sm text-muted">
          <Check className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
          {empty}
        </p>
      )}
    </div>
  );
}

/* ── 3. Analogs ───────────────────────────────────────────────────────── */

export function AnalogPanel({ result, hasPosts }: { result: { high: Analog[]; low: Analog[] }; hasPosts: boolean }) {
  const max = Math.max(1, ...result.high.map((a) => a.per1k), ...result.low.map((a) => a.per1k));
  const empty = !result.high.length && !result.low.length;
  return (
    <Panel id="analogs" n="03" title="Historical Analog Finder" kicker="What happened last time someone said this" lede="Similar posts from your history and swipe file that over- and under-performed for their authors.">
      {!hasPosts ? (
        <ImportCta>Import posts to find analogs: the closest past posts that flew, and the ones that flopped.</ImportCta>
      ) : empty ? (
        <p className="text-sm text-muted">No close analogs yet. Capture more posts on this topic and they&apos;ll show up here.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <AnalogColumn title="Flew" tone="green" items={result.high} max={max} />
          <AnalogColumn title="Flopped" tone="red" items={result.low} max={max} />
        </div>
      )}
    </Panel>
  );
}

function AnalogColumn({ title, tone, items, max }: { title: string; tone: "green" | "red"; items: Analog[]; max: number }) {
  return (
    <div>
      <p className={cn("mono-label", tone === "green" ? "text-green" : "text-red")}>
        {title} ({items.length})
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((a, i) => (
          <li key={a.post.id} className="lv-rise rounded-2xl border border-line bg-panel-2 p-4" style={d(i * 80)}>
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate">
                {a.post.author === "me" ? "You" : a.post.author} · {PLATFORM_LABEL[a.post.platform]}
                {a.post.postedAt ? ` · ${a.post.postedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
              </span>
              <Pct value={a.percentile} />
            </div>
            <p className="mt-2 text-sm text-fg-2">{excerpt(a.post.text, 180)}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-white/[0.07]">
                <div className={cn("lv-grow-x h-full rounded-full", tone === "green" ? "bg-green" : "bg-red")} style={{ width: `${Math.max(3, (a.per1k / max) * 100)}%`, ...d(i * 80 + 200) }} />
              </div>
              <span className="shrink-0 text-xs text-fg-2 tabular-nums">
                {a.per1k.toLocaleString("en-US")} <span className="text-muted">{a.basis}</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.shared.map((s) => (
                <span key={s} className="rounded bg-accent-tint px-1.5 py-0.5 text-[11px] text-accent-ink">
                  {s}
                </span>
              ))}
              {a.traits.map((t) => (
                <span key={t} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-fg-2">
                  {t}
                </span>
              ))}
            </div>
            {a.post.url ? (
              <a href={a.post.url} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                Original <ArrowUpRight className="size-3" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
        {!items.length ? <li className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">None among the closest posts.</li> : null}
      </ul>
    </div>
  );
}

/* ── 4. Hook tournament ──────────────────────────────────────────────── */

export function HookTournamentPanel({ t, idea }: { t: Tournament; idea: Idea }) {
  const chosen = idea.hooks[0];
  const learned = (Object.keys(FEATURES) as Array<keyof typeof FEATURES>).filter((k) => t.lifts.fromData[k]);
  const champion = t.rounds.length ? t.rounds[t.rounds.length - 1]![0]!.winner : t.ranked[0]?.hook;
  return (
    <Panel
      id="hooks"
      n="04"
      title="Hook Tournament"
      kicker={champion ? "The bracket has a winner" : "Add hooks to start a tournament"}
      lede={`Each hook scores 50 plus the lift its traits earned with your audience. ${learned.length ? `${learned.length} of ${Object.keys(FEATURES).length} lifts are learned from your ${t.lifts.basis} posts; the rest are defaults.` : "No lifts are learned from your data yet; all are defaults until you import posts."}`}
    >
      <ol className="space-y-2">
        {t.ranked.map((h, i) => (
          <li key={h.hook} className={cn("lv-rise rounded-2xl border p-4", i === 0 ? "border-accent/40 bg-accent-tint" : "border-line bg-panel-2")} style={d(i * 50)}>
            <div className="flex flex-wrap items-start gap-4">
              <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums", i === 0 ? "bg-accent text-[#140a05]" : "bg-white/[0.06] text-fg-2")}>
                {i === 0 ? <Crown className="size-3.5" aria-label="Winner" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{h.hook}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {h.own ? <Chip tone="accent">Yours</Chip> : null}
                  {chosen === h.hook ? <Chip tone="green">In use</Chip> : null}
                  {h.features.map((f) => (
                    <span key={f} className={cn("rounded px-1.5 py-0.5 text-[11px]", t.lifts.fromData[f] ? "bg-green/12 text-green" : "bg-white/[0.06] text-fg-2")} title={t.lifts.fromData[f] ? "Lift learned from your posts" : "Default lift"}>
                      {FEATURES[f].label} {t.lifts.lifts[f] >= 0 ? "+" : ""}
                      {t.lifts.lifts[f]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="w-24">
                  <div className="mb-1 text-right text-sm font-semibold text-fg tabular-nums">{Math.round(h.score)}</div>
                  <Track value={h.score} tone={i === 0 ? "accent" : toneFor(h.score)} delay={i * 50 + 150} />
                </div>
                {chosen !== h.hook ? (
                  <form action={chooseHook}>
                    <input type="hidden" name="ideaId" value={idea.id} />
                    <input type="hidden" name="hook" value={h.hook} />
                    <Button variant="secondary" className="px-3 py-1.5 text-xs">
                      Use this hook
                    </Button>
                  </form>
                ) : null}
                {h.own ? (
                  <form action={removeHook}>
                    <input type="hidden" name="ideaId" value={idea.id} />
                    <input type="hidden" name="hook" value={h.hook} />
                    <button className="text-subtle hover:text-red" aria-label="Remove this hook">
                      <X className="size-4" />
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <form action={addOwnHook} className="mt-4 flex flex-wrap gap-3">
        <input type="hidden" name="ideaId" value={idea.id} />
        <input name="hook" required maxLength={400} className={cn(inputClass, "min-w-0 flex-1")} placeholder="Add your own hook to the tournament" aria-label="Your hook" />
        <Button variant="secondary">
          <Plus className="size-4" aria-hidden /> Add hook
        </Button>
      </form>

      {t.rounds.length ? (
        <div className="mt-8">
          <p className="mono-label">Bracket</p>
          <div className="mt-4 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-6">
              {t.rounds.map((round, ri) => (
                <div key={ri} className="flex w-56 flex-col justify-around gap-3">
                  <p className="text-[11px] text-subtle">{ri === t.rounds.length - 1 ? "Final" : ri === t.rounds.length - 2 ? "Semifinal" : `Round ${ri + 1}`}</p>
                  {round.map((m, mi) => (
                    <div key={mi} className="lv-fade overflow-hidden rounded-xl border border-line text-xs" style={d(ri * 250 + mi * 60)}>
                      {[m.a, m.b].map((h, hi) => (
                        <div key={hi} className={cn("flex items-center gap-2 px-3 py-2", hi === 1 && "border-t border-line", h === m.winner ? "bg-accent-tint text-fg" : "text-subtle")}>
                          {h === m.winner ? <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden /> : <span className="size-1.5 shrink-0" aria-hidden />}
                          <span className={cn("truncate", h === m.winner ? "" : h ? "line-through decoration-white/20" : "italic")} title={h ?? undefined}>
                            {h ?? "bye"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              {champion ? (
                <div className="flex w-56 flex-col justify-center">
                  <p className="text-[11px] text-subtle">Champion</p>
                  <div className="lv-pop mt-3 rounded-xl border border-accent/50 bg-accent-tint p-3 text-xs text-fg" style={d(t.rounds.length * 250)}>
                    <Crown className="mb-1.5 size-4 text-accent-ink" aria-hidden />
                    {champion}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-line p-4">
        <p className="mono-label">What your audience rewards</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {(Object.keys(FEATURES) as Array<keyof typeof FEATURES>).map((k) => (
            <li key={k} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fg-2">{FEATURES[k].label}</span>
              <span className="flex items-center gap-2">
                <span className={cn("tabular-nums", t.lifts.lifts[k] >= 0 ? "text-fg" : "text-red")}>
                  {t.lifts.lifts[k] >= 0 ? "+" : ""}
                  {t.lifts.lifts[k]} pts
                </span>
                {t.lifts.fromData[k] ? <Chip tone="green">your data</Chip> : <Chip>default</Chip>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/* ── 6. Controversy vs credibility ──────────────────────────────────── */

const QUAD_TONE: Record<ClaimCheck["quadrant"], string> = {
  "Distinctive and supported": "bg-green text-[#06140d]",
  "Distinctive but unsupported": "bg-amber text-[#1a1204]",
  "Safe and supported": "bg-blue text-white",
  "Safe and unsupported": "bg-red text-white",
};

export function ControversyPanel({ result, evidenceCount }: { result: { claims: ClaimCheck[]; distinctiveness: number; credibility: number }; evidenceCount: number }) {
  return (
    <Panel
      id="claims"
      n="06"
      title="Controversy vs. Credibility"
      kicker="Is it surprising, and can you back it?"
      lede={`Each claim in your idea, plotted by how distinctive it is against whether your knowledge base supports it (${evidenceCount} ${evidenceCount === 1 ? "item" : "items"} checked).`}
      aside={
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-semibold text-fg tabular-nums">{result.distinctiveness}</p>
            <p className="text-[11px] text-muted">distinctiveness</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-fg tabular-nums">{result.credibility}%</p>
            <p className="text-[11px] text-muted">supported</p>
          </div>
        </div>
      }
    >
      {!result.claims.length ? (
        <p className="text-sm text-muted">Add a few full sentences to the idea&apos;s notes (five words or more each) to check its claims.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line" role="img" aria-label="Quadrant chart of claims by surprise and support">
              <div className="absolute inset-0 grid grid-cols-[45fr_55fr] grid-rows-2">
                <QuadLabel label="Safe and supported" className="border-r border-b border-line" />
                <QuadLabel label="Distinctive and supported" className="border-b border-line" highlight />
                <QuadLabel label="Safe and unsupported" className="border-r border-line" bottom />
                <QuadLabel label="Distinctive but unsupported" bottom />
              </div>
              {result.claims.map((c, i) => {
                const backed = c.support !== "unsupported";
                const lane = ((i * 37) % 60) / 100;
                const top = backed ? 8 + lane * 34 : 58 + lane * 34;
                const left = Math.min(92, Math.max(4, c.surprise));
                return (
                  <span
                    key={c.claim}
                    className={cn("lv-pop absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-bg", QUAD_TONE[c.quadrant])}
                    style={{ left: `${left}%`, top: `${top}%`, ...d(300 + i * 90) }}
                    title={c.claim}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-subtle">
              <span>Expected</span>
              <span>Surprise →</span>
              <span>Surprising</span>
            </div>
          </div>
          <ol className="space-y-3">
            {result.claims.map((c, i) => (
              <li key={c.claim} className="flex gap-3 rounded-2xl border border-line bg-panel-2 p-4">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", QUAD_TONE[c.quadrant])}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{c.claim}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip tone={c.support === "unsupported" ? "red" : c.support === "your data" ? "accent" : "green"}>{c.support === "your data" ? "backed by your data" : c.support}</Chip>
                    <span className="text-xs text-muted tabular-nums">surprise {c.surprise}/100</span>
                  </div>
                  <p className="mt-2 text-sm text-fg-2">{c.advice}</p>
                  {c.evidence ? <p className="mt-2 border-l-2 border-line-strong pl-2.5 text-xs text-muted">{c.evidence}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!evidenceCount ? (
        <p className="mt-6 text-sm text-muted">
          Your knowledge base is empty, so every claim reads as unsupported.{" "}
          <Link href="/studio/knowledge" className="text-accent-ink hover:text-accent">
            Add company facts, product notes and sources
          </Link>
          .
        </p>
      ) : null}
    </Panel>
  );
}

function QuadLabel({ label, className, highlight, bottom }: { label: string; className?: string; highlight?: boolean; bottom?: boolean }) {
  return (
    <div className={cn("flex p-2.5", bottom ? "items-end" : "items-start", highlight && "bg-green/[0.05]", className)}>
      <span className={cn("text-[10px] leading-tight", highlight ? "text-green" : "text-subtle")}>{label}</span>
    </div>
  );
}
