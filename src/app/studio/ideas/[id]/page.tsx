import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Archive, ArchiveRestore, CalendarPlus, PenLine } from "lucide-react";
import { planIdea, setIdeaStatus, writeArticle } from "@/app/studio/ideas/actions";
import { NewsCheck } from "@/components/ideas/forms";
import { PLATFORM_LABEL, nextTuesday } from "@/components/ideas/capture-helpers";
import { AnalogPanel, AudiencePanel, ControversyPanel, HookTournamentPanel, ViralTwinPanel } from "@/components/ideas/panels";
import { IdeaStatusChip, LabHeader, SignedOut, Skeleton } from "@/components/ideas/shell";
import { Panel } from "@/components/ideas/viz";
import { Button } from "@/components/ui";
import { env, isLive } from "@/lib/env";
import { analogs, audiencePanel, controversyCredibility, generateHooks, hookTournament, trendRadar, viralTwin } from "@/lib/studio/ideas";
import { studioSession } from "@/lib/studio/session";
import { getIdea, getProfile, listKnowledge, listPosts } from "@/lib/studio/store";

export const metadata: Metadata = { title: "Idea analysis", robots: { index: false } };

const OWN_DATA_KINDS = new Set(["company", "product", "opinion"]);

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex-1">
      <Suspense fallback={<Skeleton />}>
        <IdeaAnalysis params={params} />
      </Suspense>
    </div>
  );
}

async function IdeaAnalysis({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { id } = await params;
  const idea = /^[0-9a-f-]{36}$/i.test(id) ? await getIdea(session.email, id) : null;
  if (!idea) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-fg">Idea not found</h1>
        <p className="mt-3 text-sm text-muted">It may have been removed, or it belongs to another workspace.</p>
        <Link href="/studio/ideas" className="mt-6 inline-block text-sm font-semibold text-accent-ink hover:text-accent">
          Back to the Idea Lab
        </Link>
      </div>
    );
  }

  const [profile, posts, knowledge] = await Promise.all([getProfile(session.email), listPosts(session.email), listKnowledge(session.email)]);
  const evidenceItems = knowledge.filter((k) => k.kind !== "sample");
  const fullText = `${idea.title}. ${idea.notes}`.trim();

  const tournament = hookTournament({
    hooks: generateHooks({ title: idea.title, notes: idea.notes, audience: profile.brand?.audience }),
    ownHooks: idea.hooks,
    posts,
    platform: idea.platform,
  });
  const bestHook = idea.hooks[0] ?? tournament.ranked[0]?.hook ?? idea.title;
  const twin = viralTwin({ idea: fullText, hook: bestHook, platform: idea.platform, posts });
  const panel = audiencePanel({ idea: fullText, hook: bestHook, personas: profile.personas, evidenceText: evidenceItems.map((k) => `${k.title}. ${k.content}`).join("\n").slice(0, 200_000) });
  const analog = analogs(`${bestHook}\n${fullText}`, posts);
  const radar = trendRadar({ idea: fullText, posts, signals: [], platform: idea.platform });
  const claims = controversyCredibility({
    idea: fullText,
    evidence: evidenceItems.map((k) => ({ text: k.content, label: k.title, ownData: OWN_DATA_KINDS.has(k.kind) })),
  });
  const e = env();
  const newsLive = isLive("monid") && Boolean(e.MONID_SEARCH_PROVIDER && e.MONID_SEARCH_ENDPOINT);
  const archived = idea.status === "archived";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <LabHeader
        crumbs={[{ href: `/studio/ideas/${idea.id}`, label: "Analysis" }]}
        title={idea.title}
        lede={
          <span className="flex flex-wrap items-center gap-3">
            <IdeaStatusChip status={idea.status} />
            <span>
              {PLATFORM_LABEL[idea.platform]} · hook in use: {idea.hooks[0] ? <span className="text-fg-2">“{idea.hooks[0]}”</span> : <span>tournament winner</span>}
            </span>
          </span>
        }
      />

      {idea.notes ? <p className="mt-6 max-w-3xl border-l-2 border-line-strong pl-4 text-sm whitespace-pre-line text-fg-2">{idea.notes}</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4">
        <form action={planIdea}>
          <input type="hidden" name="ideaId" value={idea.id} />
          <Button variant="secondary" disabled={archived}>
            <CalendarPlus className="size-4" aria-hidden /> Plan it for {new Date(`${nextTuesday()}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </Button>
        </form>
        <form action={writeArticle}>
          <input type="hidden" name="ideaId" value={idea.id} />
          <Button disabled={archived}>
            <PenLine className="size-4" aria-hidden /> Write the article
          </Button>
        </form>
        <form action={setIdeaStatus} className="ml-auto">
          <input type="hidden" name="ideaId" value={idea.id} />
          <input type="hidden" name="status" value={archived ? "exploring" : "archived"} />
          <Button variant="ghost">
            {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />} {archived ? "Restore" : "Archive"}
          </Button>
        </form>
      </div>

      <nav aria-label="Tools" className="mt-6 flex flex-wrap gap-2 text-xs">
        {[
          ["twin", "Viral Twin"],
          ["audience", "Audience"],
          ["analogs", "Analogs"],
          ["hooks", "Hooks"],
          ["timing", "Timing"],
          ["claims", "Claims"],
        ].map(([href, label]) => (
          <a key={href} href={`#${href}`} className="rounded-full border border-line px-3 py-1 text-muted hover:border-line-strong hover:text-fg">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-6">
        <ViralTwinPanel twin={twin} />
        <AudiencePanel panel={panel} />
        <AnalogPanel result={analog} hasPosts={posts.length > 0} />
        <HookTournamentPanel t={tournament} idea={idea} />
        <Panel id="timing" n="05" title="Trend Timing Radar" kicker="Is now the moment?" lede="Dated activity on this topic in your history and swipe file, plus live news when Monid search is connected.">
          <NewsCheck ideaId={idea.id} initial={radar} live={newsLive} />
        </Panel>
        <ControversyPanel result={claims} evidenceCount={evidenceItems.length} />
      </div>
    </div>
  );
}
