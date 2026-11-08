import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/studio/action-form";
import { Card, PageHead, SignedOut, Skeleton, timeAgo } from "@/components/studio/shared";
import { Chip, Field, cn, inputClass } from "@/components/ui";
import type { KnowledgeItem, KnowledgeKind, Memory } from "@/lib/db/schema";
import { studioSession } from "@/lib/studio/session";
import { listKnowledge, listMemories } from "@/lib/studio/store";
import { addKnowledgeItem, addMemory, deleteKnowledge, deleteMemory, toggleMemory, togglePin } from "../actions";

export const metadata: Metadata = { title: "Knowledge" };

type Kind = Exclude<KnowledgeKind, "sample">;
const KINDS: Array<{ kind: Kind; label: string; hint: string }> = [
  { kind: "company", label: "Company facts", hint: "Numbers, history, team, what you do" },
  { kind: "product", label: "Product", hint: "Features, pricing, how it works" },
  { kind: "opinion", label: "Founder opinions", hint: "Takes you'd defend in public" },
  { kind: "article", label: "Earlier articles", hint: "Things you've already published" },
  { kind: "source", label: "Approved sources", hint: "Reports and sites you trust" },
];
const ORIGIN: Record<Memory["origin"], string> = { edit_request: "From an edit", founder_reply: "From your reply", manual: "Added by you" };

export default function KnowledgePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Knowledge searchParams={searchParams} />
    </Suspense>
  );
}

const iconBtn = "grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg";

async function Knowledge({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { kind: rawKind } = await searchParams;
  const filter = KINDS.find((k) => k.kind === rawKind)?.kind ?? null;
  const [all, mems] = await Promise.all([listKnowledge(session.email), listMemories(session.email)]);
  const items = all.filter((k) => k.kind !== "sample");
  const count = (k: Kind) => items.filter((i) => i.kind === k).length;
  const groups = KINDS.filter((k) => !filter || k.kind === filter);

  return (
    <>
      <PageHead label="Knowledge" title="What the desk knows" lede="The Researcher pulls the relevant items into every article's research. Pinned items go into every article, whatever the topic." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <FilterChip href="/studio/knowledge" active={!filter} label="All" n={items.length} />
            {KINDS.map((k) => (
              <FilterChip key={k.kind} href={`/studio/knowledge?kind=${k.kind}`} active={filter === k.kind} label={k.label} n={count(k.kind)} />
            ))}
          </div>
          <div className="space-y-8">
            {groups.map((g) => {
              const list = items.filter((i) => i.kind === g.kind);
              if (!list.length && !filter) return null;
              return (
                <section key={g.kind}>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[15px] font-semibold text-fg">{g.label}</h2>
                    <span className="text-xs text-subtle">{g.hint}</span>
                  </div>
                  {list.length ? (
                    <ul className="space-y-2">
                      {list.map((item) => (
                        <KnowledgeRow key={item.id} item={item} />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing here yet.</p>
                  )}
                </section>
              );
            })}
            {!items.length && !filter ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Your knowledge base is empty. Capture your brand in onboarding, or add facts on the right.</p> : null}
          </div>
        </div>

        <Card title="Add knowledge" className="h-fit lg:sticky lg:top-24">
          <ActionForm action={addKnowledgeItem} submit="Add">
            <Field label="Kind">
              <select name="kind" defaultValue={filter ?? "company"} className={inputClass}>
                {KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>{k.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input name="title" required className={inputClass} placeholder="ARR and growth, Q3" />
            </Field>
            <Field label="Content">
              <textarea name="content" required rows={5} className={inputClass} />
            </Field>
            <Field label="URL (optional)">
              <input name="url" type="url" className={inputClass} placeholder="https://" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" name="pinned" className="accent-[var(--accent)]" />
              Use in every article
            </label>
          </ActionForm>
        </Card>
      </div>

      <section className="mt-12">
        <Card title="Editorial memory" aside={<span className="text-xs text-muted">{mems.filter((m) => m.active).length} active</span>}>
          <p className="mb-5 max-w-2xl text-sm text-muted">
            Rules like &ldquo;use teams instead of customers&rdquo; or &ldquo;never say synergy&rdquo; are applied by the Editor to every future article. The desk also remembers corrections you make while reviewing drafts.
          </p>
          {mems.length ? (
            <ul className="mb-6 divide-y divide-line rounded-xl border border-line">
              {mems.map((m) => (
                <li key={m.id} className={cn("flex items-center gap-3 p-3", !m.active && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", m.active ? "text-fg" : "text-muted line-through decoration-white/20")}>{m.text}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {ORIGIN[m.origin]} · {m.kind} · {timeAgo(m.createdAt)}
                    </p>
                  </div>
                  <form action={toggleMemory}>
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={m.active}
                      aria-label={m.active ? "Turn off" : "Turn on"}
                      className={cn("relative h-5 w-9 rounded-full transition-colors", m.active ? "bg-accent" : "bg-white/15")}
                    >
                      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", m.active ? "left-[18px]" : "left-0.5")} />
                    </button>
                  </form>
                  <form action={deleteMemory}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className={cn(iconBtn, "hover:bg-red/10 hover:text-red")} aria-label="Delete rule">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={addMemory} submit="Remember this" variant="secondary">
            <Field label="Add a rule">
              <input name="text" required className={inputClass} placeholder="Say teams, not customers" />
            </Field>
          </ActionForm>
        </Card>
      </section>
    </>
  );
}

function FilterChip({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-accent/40 bg-accent-tint text-accent-ink" : "border-line text-muted hover:text-fg")}
    >
      {label}
      <span className="tabular-nums opacity-70">{n}</span>
    </Link>
  );
}

function KnowledgeRow({ item }: { item: KnowledgeItem }) {
  return (
    <li className="group rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-fg">{item.title}</p>
            {item.pinned ? <Chip tone="accent">Every article</Chip> : null}
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted">{item.content.slice(0, 600)}</p>
          <p className="mt-2 text-[11px] text-subtle">
            Updated {timeAgo(item.updatedAt)}
            {item.url ? (
              <>
                {" · "}
                <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-fg">{hostOf(item.url)}</a>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <form action={togglePin}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className={cn(iconBtn, item.pinned && "text-accent-ink")} aria-label={item.pinned ? "Unpin" : "Pin to every article"} title={item.pinned ? "Unpin" : "Use in every article"}>
              {item.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
            </button>
          </form>
          <form action={deleteKnowledge}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className={cn(iconBtn, "hover:bg-red/10 hover:text-red")} aria-label={`Delete ${item.title}`}>
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "link";
  }
}
