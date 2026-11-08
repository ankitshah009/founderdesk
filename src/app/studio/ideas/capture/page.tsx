import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddPostForm } from "@/components/ideas/forms";
import { guessAuthor, platformFromUrl } from "@/components/ideas/capture-helpers";
import { LabHeader, SignedOut, Skeleton } from "@/components/ideas/shell";
import { normalizePlatform } from "@/lib/studio/ideas";
import { studioSession } from "@/lib/studio/session";

export const metadata: Metadata = { title: "Capture post", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function CapturePage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex-1">
      <Suspense fallback={<Skeleton />}>
        <Capture searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Capture({ searchParams }: { searchParams: Search }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut what="the post capture" />;
  const sp = await searchParams;
  const rawUrl = one(sp.url).slice(0, 2000);
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
  const text = one(sp.text).slice(0, 5000);
  const platform = platformFromUrl(url) ?? normalizePlatform(one(sp.platform) || null);
  const author = guessAuthor(url) ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <LabHeader
        crumbs={[
          { href: "/studio/ideas/library", label: "Swipe file" },
          { href: "/studio/ideas/capture", label: "Capture" },
        ]}
        title="Capture post"
        lede="Check the text, set the author, and type the numbers you can see on the post. Followers (or impressions) make it comparable with posts from bigger and smaller accounts."
      />
      {!url && !text ? <p className="mt-6 text-sm text-muted">Nothing was passed in. Use the &quot;Capture post&quot; bookmarklet from your swipe file page, or fill the form by hand.</p> : null}
      <div className="mt-8 rounded-3xl border border-line bg-panel p-6">
        <AddPostForm via="bookmarklet" defaults={{ url, text, platform, author: author || "" }} />
      </div>
    </div>
  );
}
