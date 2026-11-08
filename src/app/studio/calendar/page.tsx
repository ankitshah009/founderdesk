import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StageChip } from "@/components/stages";
import { ActionForm } from "@/components/studio/action-form";
import { Card, PageHead, SignedOut, Skeleton } from "@/components/studio/shared";
import { Button, Field, cn, inputClass } from "@/components/ui";
import type { CalendarEntry, Job } from "@/lib/db/schema";
import { monthGrid, monthParam, ymd } from "@/lib/studio/calendar";
import { studioSession } from "@/lib/studio/session";
import { calendarRange, founderJobs, getProfile, listWorkflows, planCadences } from "@/lib/studio/store";
import { addCalendarEntry, deleteEntry, moveEntry, skipEntry, startEntry } from "../actions";

export const metadata: Metadata = { title: "Calendar" };

type Search = Promise<{ m?: string; e?: string }>;

export default function CalendarPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <CalendarView searchParams={searchParams} />
    </Suspense>
  );
}

const ORIGIN: Record<CalendarEntry["origin"], { label: string; cls: string; dot: string }> = {
  founder: { label: "Planned by you", cls: "border-white/15 bg-white/[0.05] text-fg-2", dot: "bg-fg-2" },
  cadence: { label: "Recurring agent", cls: "border-blue/30 bg-blue/10 text-[#8db4ff]", dot: "bg-blue" },
  performance: { label: "From performance", cls: "border-green/30 bg-green/10 text-green", dot: "bg-green" },
  refresh: { label: "Refresh", cls: "border-amber/30 bg-amber/10 text-amber", dot: "bg-amber" },
};
const STATUS_LABEL: Record<CalendarEntry["status"], string> = { planned: "Planned", ordered: "Ordered", published: "Published", skipped: "Skipped" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function CalendarView({ searchParams }: { searchParams: Search }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { email } = session;
  const { m, e } = await searchParams;
  const month = monthParam(m);
  const weeks = monthGrid(month.year, month.month0);
  await planCadences(email);
  const [entries, flows, profile, jobs] = await Promise.all([calendarRange(email, weeks[0]![0]!, weeks.at(-1)![6]!), listWorkflows(email), getProfile(email), founderJobs(email)]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const byDay = new Map<string, CalendarEntry[]>();
  for (const en of entries) byDay.set(en.date, [...(byDay.get(en.date) ?? []), en]);
  const selected = e ? (entries.find((x) => x.id === e) ?? null) : null;
  const today = ymd(new Date());
  const monthPrefix = month.key;
  const href = (params: { m?: string; e?: string }) => {
    const q = new URLSearchParams();
    if (params.m) q.set("m", params.m);
    if (params.e) q.set("e", params.e);
    const s = q.toString();
    return `/studio/calendar${s ? `?${s}` : ""}`;
  };
  const inMonth = entries.filter((x) => x.date.startsWith(monthPrefix));

  return (
    <>
      <PageHead label="Calendar" title="Editorial calendar" lede="Recurring agents plan their own slots. Add one-off pieces, then start an article from any entry when you're ready.">
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          {Object.values(ORIGIN).map((o) => (
            <span key={o.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", o.dot)} aria-hidden />
              {o.label}
            </span>
          ))}
        </div>
      </PageHead>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">{month.label}</h2>
        <div className="flex items-center gap-1">
          <Link href={href({ m: month.prev })} className="grid size-8 place-items-center rounded-md border border-line text-muted hover:text-fg" aria-label="Previous month">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href="/studio/calendar" className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-fg">Today</Link>
          <Link href={href({ m: month.next })} className="grid size-8 place-items-center rounded-md border border-line text-muted hover:text-fg" aria-label="Next month">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div className={cn("grid gap-5", selected && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
        <div className="min-w-0">
          {/* Month grid (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
            <div className="grid grid-cols-7 border-b border-line bg-white/[0.02]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-[11px] text-subtle">{d}</div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map((day) => {
                  const list = byDay.get(day) ?? [];
                  const outside = !day.startsWith(monthPrefix);
                  return (
                    <div key={day} className={cn("min-h-28 border-r border-line p-1.5 last:border-r-0", outside && "bg-white/[0.015]")}>
                      <p className={cn("mb-1 px-1 text-[11px] tabular-nums", day === today ? "font-semibold text-accent-ink" : outside ? "text-subtle/60" : "text-subtle")}>{Number(day.slice(8))}</p>
                      <ul className="space-y-1">
                        {list.slice(0, 4).map((en) => (
                          <li key={en.id}>
                            <EntryChip en={en} job={en.jobId ? jobById.get(en.jobId) : undefined} href={href({ m: month.key, e: en.id })} active={selected?.id === en.id} />
                          </li>
                        ))}
                        {list.length > 4 ? <li className="px-1 text-[10px] text-subtle">+{list.length - 4} more</li> : null}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* List (mobile) */}
          <ul className="space-y-2 md:hidden">
            {inMonth.map((en) => (
              <li key={en.id} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs tabular-nums text-subtle">{new Date(`${en.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                <div className="min-w-0 flex-1">
                  <EntryChip en={en} job={en.jobId ? jobById.get(en.jobId) : undefined} href={href({ m: month.key, e: en.id })} active={selected?.id === en.id} />
                </div>
              </li>
            ))}
            {!inMonth.length ? <li className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing planned this month.</li> : null}
          </ul>
        </div>

        {selected ? (
          <Card
            title={selected.title}
            aside={<Link href={href({ m: month.key })} className="text-xs text-muted hover:text-fg">Close</Link>}
            className="h-fit xl:sticky xl:top-24"
          >
            <EntryPanel en={selected} job={selected.jobId ? jobById.get(selected.jobId) : undefined} workflowName={flows.find((w) => w.id === selected.workflowId)?.name} personaName={profile.personas.find((p) => p.id === selected.personaId)?.name} />
          </Card>
        ) : null}
      </div>

      <section className="mt-10">
        <Card title="Add to calendar">
          <ActionForm action={addCalendarEntry} submit="Add">
            <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
              <Field label="Title">
                <input name="title" required className={inputClass} placeholder="Why we stopped doing demos" />
              </Field>
              <Field label="Date">
                <input name="date" type="date" required defaultValue={today} className={inputClass} />
              </Field>
              <Field label="Workflow">
                <select name="workflowId" className={inputClass} defaultValue="">
                  <option value="">None</option>
                  {flows.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Persona">
                <select name="personaId" className={inputClass} defaultValue="">
                  <option value="">Any reader</option>
                  {profile.personas.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} placeholder="The argument, links, anything the desk should know" />
            </Field>
          </ActionForm>
        </Card>
      </section>
    </>
  );
}

function EntryChip({ en, job, href, active }: { en: CalendarEntry; job?: Job; href: string; active: boolean }) {
  const o = ORIGIN[en.origin];
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "flex items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors hover:brightness-125",
        o.cls,
        en.status === "skipped" && "line-through opacity-50",
        active && "ring-1 ring-accent",
      )}
      title={`${en.title} · ${STATUS_LABEL[en.status]}`}
    >
      {en.status === "ordered" ? <span className={cn("size-1.5 shrink-0 rounded-full bg-accent", job && job.stage !== "COMPLETE" && job.stage !== "PUBLISHED" && "pulse-dot")} aria-label="Ordered" /> : null}
      {en.status === "published" ? <span className="shrink-0 text-green" aria-label="Published">✓</span> : null}
      <span className="truncate">{en.title}</span>
    </Link>
  );
}

function EntryPanel({ en, job, workflowName, personaName }: { en: CalendarEntry; job?: Job; workflowName?: string; personaName?: string }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="mono-label mb-1">Date</dt>
          <dd className="text-fg-2">{en.date}</dd>
        </div>
        <div>
          <dt className="mono-label mb-1">Status</dt>
          <dd className="text-fg-2">{STATUS_LABEL[en.status]}</dd>
        </div>
        <div>
          <dt className="mono-label mb-1">Origin</dt>
          <dd className="text-fg-2">{ORIGIN[en.origin].label}</dd>
        </div>
        <div>
          <dt className="mono-label mb-1">Persona</dt>
          <dd className="text-fg-2">{personaName ?? "Any"}</dd>
        </div>
        {workflowName ? (
          <div className="col-span-2">
            <dt className="mono-label mb-1">Workflow</dt>
            <dd className="text-fg-2">{workflowName}</dd>
          </div>
        ) : null}
      </dl>
      {en.notes ? <p className="whitespace-pre-line text-sm text-muted">{en.notes}</p> : null}
      {job ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
          <StageChip stage={job.stage} />
          <Link href={`/studio/articles/${job.id}`} className="text-xs font-semibold text-accent-ink hover:text-accent">Open article</Link>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!job && en.status !== "skipped" ? (
          <form action={startEntry}>
            <input type="hidden" name="id" value={en.id} />
            <Button type="submit" className="px-3 py-1.5 text-xs">Start article</Button>
          </form>
        ) : null}
        {!job ? (
          <form action={skipEntry}>
            <input type="hidden" name="id" value={en.id} />
            <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">{en.status === "skipped" ? "Un-skip" : "Skip"}</Button>
          </form>
        ) : null}
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={en.id} />
          <Button type="submit" variant="danger" className="px-3 py-1.5 text-xs">Delete</Button>
        </form>
      </div>
      <form action={moveEntry} className="flex items-end gap-2 border-t border-line pt-4">
        <input type="hidden" name="id" value={en.id} />
        <Field label="Move to">
          <input name="date" type="date" required defaultValue={en.date} className={inputClass} />
        </Field>
        <Button type="submit" variant="secondary" className="px-3 py-2 text-xs">Move</Button>
      </form>
    </div>
  );
}
