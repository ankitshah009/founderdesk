import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, Flame, GitCompareArrows, Radar, Scale, Swords, Users } from "lucide-react";
import { NewIdeaForm } from "@/components/ideas/forms";
import { PLATFORM_LABEL } from "@/components/ideas/capture-helpers";
import { IdeaStatusChip, LabHeader, SignedOut, Skeleton } from "@/components/ideas/shell";
import { ButtonLink, cn } from "@/components/ui";
import { studioSession } from "@/lib/studio/session";
import { listIdeas, listPosts } from "@/lib/studio/store";

export const metadata: Metadata = { title: "Idea Lab", robots: { index: false } };

const TOOLS = [
  { Icon: Flame, name: "Viral Twin Simulator", line: "Predicts where the idea lands among your own posts, from its nearest twins in your history and swipe file." },
  { Icon: Users, name: "Audience Reaction Panel", line: "Your personas react: interest, objections and the questions they'd ask. Simulated, and labelled so." },
  { Icon: GitCompareArrows, name: "Historical Analog Finder", line: "Similar posts that flew and flopped, side by side, with engagement normalised for account size." },
  { Icon: Swords, name: "Hook Tournament", line: "Up to 12 hooks face off in a bracket scored by what your audience has rewarded before." },
  { Icon: Radar, name: "Trend Timing Radar", line: "Is the topic rising or cooling? Plus your best day and hour to post." },
  { Icon: Scale, name: "Controversy vs. Credibility", line: "Plots each claim by how surprising it is against whether you can back it up." },
];

export default function IdeaLabPage() {
  return (
    <div className="flex-1">
      <Suspense fallback={<Skeleton />}>
        <IdeaLab />
      </Suspense>
    </div>
  );
}

async function IdeaLab() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const [ideaRows, posts] = await Promise.all([listIdeas(session.email), listPosts(session.email)]);
  const mine = posts.filter((p) => p.author === "me").length;
  const swipe = posts.length - mine;
  const creators = new Set(posts.filter((p) => p.author !== "me").map((p) => p.author.toLowerCase())).size;
  const thin = mine < 6 || swipe < 5;
  const active = ideaRows.filter((i) => i.status !== "archived");
  const archived = ideaRows.filter((i) => i.status === "archived");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <LabHeader
        title="Idea Lab"
        lede="Test an idea before you write it. Six tools judge it against your own post history and the viral posts you've saved from other creators."
        actions={
          <ButtonLink href="/studio/ideas/library" variant="secondary">
            Swipe file &amp; posts
          </ButtonLink>
        }
      />

      <section
        className={cn("lv-rise mt-10 flex flex-wrap items-center justify-between gap-6 rounded-3xl border p-6 md:p-8", thin ? "border-accent/30 bg-accent-tint" : "border-line bg-panel")}
        aria-label="What the lab learns from"
      >
        <div className="flex flex-wrap items-center gap-8">
          <Stat n={mine} label="of your posts" />
          <Stat n={swipe} label="swipe-file posts" />
          <Stat n={creators} label={creators === 1 ? "creator" : "creators"} />
        </div>
        <div className="max-w-sm">
          {thin ? (
            <>
              <p className="text-sm text-fg">
                {mine + swipe === 0 ? "The lab has nothing to learn from yet." : "That's thin."} Import at least 6 of your posts and 5 from creators you admire for predictions based on your audience, not defaults.
              </p>
              <ButtonLink href="/studio/ideas/library#import" className="mt-4">
                Import posts <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </>
          ) : (
            <p className="text-sm text-muted">
              The lab learns from {mine} of your posts and {swipe} swipe-file posts from {creators} creators.{" "}
              <Link href="/studio/ideas/library#import" className="text-accent-ink hover:text-accent">
                Add more
              </Link>
            </p>
          )}
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-line bg-panel p-6 md:p-8" aria-labelledby="new-idea">
          <p className="mono-label">New idea</p>
          <h2 id="new-idea" className="mt-3 mb-6 text-xl font-semibold tracking-[-0.02em] text-fg">
            What do you want to say?
          </h2>
          <NewIdeaForm />
        </section>

        <section aria-labelledby="your-ideas">
          <div className="flex items-baseline justify-between">
            <h2 id="your-ideas" className="text-lg font-semibold tracking-[-0.02em] text-fg">
              Your ideas
            </h2>
            <span className="text-xs text-muted">{active.length} active</span>
          </div>
          <ul className="mt-4 space-y-3">
            {active.map((i, n) => (
              <IdeaRow key={i.id} idea={i} n={n} />
            ))}
            {!active.length ? <li className="rounded-3xl border border-dashed border-line p-8 text-center text-sm text-muted">No ideas yet. Write one on the left and the lab will take it apart.</li> : null}
          </ul>
          {archived.length ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted hover:text-fg">Archived ({archived.length})</summary>
              <ul className="mt-3 space-y-3">
                {archived.map((i, n) => (
                  <IdeaRow key={i.id} idea={i} n={n} />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>

      <section className="mt-16" aria-labelledby="tools">
        <p className="mono-label">How it works</p>
        <h2 id="tools" className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-fg">
          Six tools, one page per idea
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">Every score is computed from your data. Where there isn&apos;t enough of it, the result says so and shows which defaults it used.</p>
        <ul className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t, i) => (
            <li key={t.name} className="lv-rise bg-panel p-6" style={{ ["--d" as string]: `${i * 60}ms` }}>
              <t.Icon className="size-5 text-accent-ink" aria-hidden />
              <p className="mt-4 font-semibold text-fg">{t.name}</p>
              <p className="mt-1.5 text-sm text-muted">{t.line}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold tracking-[-0.04em] text-fg tabular-nums">{n.toLocaleString("en-US")}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function IdeaRow({ idea, n }: { idea: Awaited<ReturnType<typeof listIdeas>>[number]; n: number }) {
  return (
    <li className="lv-rise" style={{ ["--d" as string]: `${Math.min(n, 8) * 40}ms` }}>
      <Link href={`/studio/ideas/${idea.id}`} className="group block rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong hover:bg-panel-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium text-fg">{idea.title}</p>
          <IdeaStatusChip status={idea.status} />
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          {PLATFORM_LABEL[idea.platform]} · {idea.hooks.length} own {idea.hooks.length === 1 ? "hook" : "hooks"} · updated {idea.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          <ArrowRight className="ml-auto size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </p>
      </Link>
    </li>
  );
}
