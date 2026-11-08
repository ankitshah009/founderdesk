import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { deletePost } from "@/app/studio/ideas/actions";
import { AddPostForm, CaptureBookmarklet, CsvImportForm } from "@/components/ideas/forms";
import { PLATFORM_LABEL, POST_PLATFORM_LIST, captureScript } from "@/components/ideas/capture-helpers";
import { LabHeader, SignedOut, Skeleton } from "@/components/ideas/shell";
import { Pct, excerpt } from "@/components/ideas/viz";
import { Chip, cn } from "@/components/ui";
import type { PostPlatform } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { engagement, percentiles } from "@/lib/studio/ideas";
import { studioSession } from "@/lib/studio/session";
import { listPosts } from "@/lib/studio/store";

export const metadata: Metadata = { title: "Swipe file & posts", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function LibraryPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex-1">
      <Suspense fallback={<Skeleton />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return env().APP_URL.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Library({ searchParams }: { searchParams: Search }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut what="your swipe file" />;
  const sp = await searchParams;
  const who = ["mine", "creators"].includes(one(sp.who)) ? one(sp.who) : "all";
  const platform = POST_PLATFORM_LIST.includes(one(sp.platform) as PostPlatform) ? (one(sp.platform) as PostPlatform) : null;
  const [posts, origin] = await Promise.all([listPosts(session.email), appOrigin()]);
  const pct = percentiles(posts);
  const shown = posts.filter((p) => (who === "mine" ? p.author === "me" : who === "creators" ? p.author !== "me" : true) && (!platform || p.platform === platform));
  const mine = posts.filter((p) => p.author === "me").length;
  const platformsInUse = POST_PLATFORM_LIST.filter((pl) => posts.some((p) => p.platform === pl));
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const next = { who: who === "all" ? null : who, platform, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/studio/ideas/library${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <LabHeader
        crumbs={[{ href: "/studio/ideas/library", label: "Swipe file & posts" }]}
        title="Swipe file & post history"
        lede={`Your own posts teach the lab what your audience rewards; creators' posts show what works nearby. ${posts.length} posts: ${mine} yours, ${posts.length - mine} from creators.`}
      />

      {one(sp.saved) ? (
        <p role="status" className="mt-6 rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-sm text-green">
          Post captured and saved.
        </p>
      ) : null}

      <section className="mt-10" aria-label="Posts">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All"],
              ["mine", "Mine"],
              ["creators", "Creators"],
            ] as const
          ).map(([k, label]) => (
            <FilterLink key={k} href={href({ who: k === "all" ? null : k })} active={who === k}>
              {label}
            </FilterLink>
          ))}
          <span className="mx-2 h-4 w-px bg-line" aria-hidden />
          <FilterLink href={href({ platform: null })} active={!platform}>
            Any platform
          </FilterLink>
          {platformsInUse.map((pl) => (
            <FilterLink key={pl} href={href({ platform: pl })} active={platform === pl}>
              {PLATFORM_LABEL[pl]}
            </FilterLink>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-panel text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Author</th>
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 text-right font-medium">Engagement</th>
                <th className="px-4 py-3 text-right font-medium">Percentile</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.slice(0, 300).map((p) => {
                const e = engagement(p);
                return (
                  <tr key={p.id} className="align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-fg">{p.author === "me" ? "You" : p.author}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {PLATFORM_LABEL[p.platform]}
                        {p.postedAt ? ` · ${p.postedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}` : ""}
                      </p>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="text-fg-2">{excerpt(p.text, 150)}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-subtle">
                        {p.likes.toLocaleString("en-US")} likes · {p.comments.toLocaleString("en-US")} comments · {p.shares.toLocaleString("en-US")} shares
                        {p.capturedVia !== "manual" ? <Chip className="py-0 text-[10px]">{p.capturedVia === "bookmarklet" ? "captured" : p.capturedVia}</Chip> : null}
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-fg">
                            Open <ArrowUpRight className="size-3" aria-hidden />
                          </a>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <p className="text-fg tabular-nums">{(Math.round(e.value * 10) / 10).toLocaleString("en-US")}</p>
                      <p className="text-xs text-muted">{e.basis === "raw" ? "raw (add followers)" : `per 1k ${e.basis}`}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Pct value={pct.get(p.id) ?? 50} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deletePost}>
                        <input type="hidden" name="postId" value={p.id} />
                        <button className="text-subtle hover:text-red" aria-label="Delete post">
                          <Trash2 className="size-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!shown.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    {posts.length ? "No posts match these filters." : "No posts yet. Add some below; the Idea Lab gets sharper with every one."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {shown.length > 300 ? <p className="mt-2 text-xs text-muted">Showing the 300 most recent of {shown.length}.</p> : null}
        <p className="mt-2 text-xs text-muted">Engagement weights comments ×2 and shares ×3, per 1,000 followers (or impressions). Percentile is within the same author and platform when there are 5+ posts, otherwise within the platform.</p>
      </section>

      <section id="import" className="mt-16 scroll-mt-24" aria-labelledby="import-h">
        <p className="mono-label">Import</p>
        <h2 id="import-h" className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-fg">
          Feed the lab
        </h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div id="capture" className="scroll-mt-24 rounded-3xl border border-accent/30 bg-panel p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-xl">
                <p className="font-semibold text-fg">Capture posts while you browse</p>
                <p className="mt-1.5 text-sm text-muted">
                  Drag the button to your bookmarks bar. On any post (X, LinkedIn, a newsletter), select its text if you like and click the bookmark: a prefilled form opens here, you add the numbers, and it&apos;s in your swipe file.
                </p>
              </div>
              <CaptureBookmarklet href={captureScript(origin)} />
            </div>
          </div>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <p className="mb-5 font-semibold text-fg">Add one post</p>
            <AddPostForm />
          </div>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <p className="mb-5 font-semibold text-fg">Paste a CSV</p>
            <CsvImportForm />
          </div>
        </div>
        <p className="mt-6 text-sm text-muted">
          Back to the{" "}
          <Link href="/studio/ideas" className="text-accent-ink hover:text-accent">
            Idea Lab
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-xs", active ? "border-accent/50 bg-accent-tint text-accent-ink" : "border-line text-muted hover:border-line-strong hover:text-fg")}>
      {children}
    </Link>
  );
}
