import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, Chip } from "@/components/ui";
import type { Idea } from "@/lib/db/schema";

export function SignedOut({ what = "the Idea Lab" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="mono-label">Studio</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-fg">Sign in to use {what}.</h1>
      <p className="mt-3 text-sm text-muted">Your ideas, posts and swipe file are private to your workspace.</p>
      <ButtonLink href="/studio" className="mt-8">
        Go to the Studio
      </ButtonLink>
    </div>
  );
}

export function LabHeader({ title, lede, crumbs, actions }: { title: ReactNode; lede?: ReactNode; crumbs?: Array<{ href: string; label: string }>; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0 max-w-3xl">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted">
          <Link href="/studio/ideas" className="hover:text-fg">
            Idea Lab
          </Link>
          {crumbs?.map((c) => (
            <span key={c.href} className="flex items-center gap-2">
              <span aria-hidden>/</span>
              <Link href={c.href} className="hover:text-fg">
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-balance text-fg md:text-4xl">{title}</h1>
        {lede ? <p className="mt-3 max-w-2xl text-sm text-muted md:text-base">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export function IdeaStatusChip({ status }: { status: Idea["status"] }) {
  const tone = status === "planned" ? "blue" : status === "ordered" ? "green" : status === "archived" ? "neutral" : "accent";
  const label = { exploring: "Exploring", planned: "Planned", ordered: "Article ordered", archived: "Archived" }[status];
  return <Chip tone={tone}>{label}</Chip>;
}

export function Skeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-12" aria-busy>
      <div className="h-10 w-72 rounded-xl bg-white/[0.04]" />
      <div className="h-64 rounded-3xl bg-white/[0.03]" />
      <div className="h-64 rounded-3xl bg-white/[0.03]" />
    </div>
  );
}
