import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/studio/action-form";
import { Card, PageHead, SignedOut, Skeleton, timeAgo } from "@/components/studio/shared";
import { Button, Chip, Field, MonoLabel, cn, inputClass } from "@/components/ui";
import { CADENCES, type Persona, type Workflow } from "@/lib/db/schema";
import { AGENT_TEAM, CUSTOM_AGENT_TITLES, WORKFLOW_TEMPLATES } from "@/lib/studio/presets";
import { studioSession } from "@/lib/studio/session";
import { agentLog, founderJobs, getProfile, listWorkflows } from "@/lib/studio/store";
import { createFromTemplate, deleteWorkflow, runWorkflow, saveWorkflow, toggleWorkflow } from "../actions";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Agents />
    </Suspense>
  );
}

const CHANNELS = [
  ["web", "Web article"],
  ["linkedin", "LinkedIn"],
  ["x", "X"],
  ["newsletter", "Newsletter"],
  ["instagram", "Instagram"],
] as const;
const CADENCE_LABEL: Record<string, string> = { none: "On demand", weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" };
const iconBtn = "grid size-8 place-items-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg";

async function Agents() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const { email } = session;
  const [profile, jobs, flows] = await Promise.all([getProfile(email), founderJobs(email), listWorkflows(email)]);
  const runs = await agentLog(jobs.map((j) => j.id), 1000);

  return (
    <>
      <PageHead label="Agents" title="Agent desk" lede="Five built-in agents work every article in order. Add your own recurring agents and reusable formats on top." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {AGENT_TEAM.map((a, i) => {
          const mine = runs.filter((r) => r.role === a.role);
          const last = mine[0];
          return (
            <Card key={a.role} className="flex flex-col p-4 md:p-5">
              <div className="flex items-center justify-between">
                <span className="mono-label">0{i + 1}</span>
                <span className="text-xs tabular-nums text-muted">{mine.length} run{mine.length === 1 ? "" : "s"}</span>
              </div>
              <p className="mt-3 font-semibold text-fg">{a.name}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{a.does}</p>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                <span className="text-subtle">Checks: </span>
                {a.checks}
              </p>
              <div className="mt-auto border-t border-line pt-3">
                {last ? (
                  <p className="text-[11px] text-muted">
                    <span className="text-fg-2">{last.action}</span> · {timeAgo(last.createdAt)}
                    {last.simulated ? " · simulated" : ""}
                  </p>
                ) : (
                  <p className="text-[11px] text-subtle">No runs yet</p>
                )}
              </div>
            </Card>
          );
        })}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Custom agents &amp; workflows</h2>
          <span className="text-xs text-muted">Recurring agents put their slots on your calendar automatically.</span>
        </div>
        {flows.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {flows.map((w) => (
              <WorkflowCard key={w.id} w={w} personas={profile.personas} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No custom agents yet. Start from a template below or create your own.</p>
        )}
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Start from a template">
          <ul className="divide-y divide-line">
            {WORKFLOW_TEMPLATES.map((t, i) => (
              <li key={t.name} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-fg">{t.name}</p>
                    <Chip tone={t.kind === "agent" ? "accent" : "neutral"}>{t.kind === "agent" ? (t.agentTitle ?? "Agent") : "Format"}</Chip>
                    {t.cadence !== "none" ? <span className="text-[11px] text-subtle">{CADENCE_LABEL[t.cadence]}</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                </div>
                <form action={createFromTemplate}>
                  <input type="hidden" name="index" value={i} />
                  <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                    <Plus className="size-3.5" aria-hidden /> Add
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Create your own">
          <WorkflowForm personas={profile.personas} />
        </Card>
      </section>
    </>
  );
}

function WorkflowCard({ w, personas }: { w: Workflow; personas: Persona[] }) {
  const persona = personas.find((p) => p.id === w.personaId);
  return (
    <Card className={cn(!w.enabled && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-fg">{w.name}</p>
            <Chip tone={w.kind === "agent" ? "accent" : "neutral"}>{w.kind === "agent" ? (w.agentTitle ?? "Agent") : "Format"}</Chip>
            {!w.enabled ? <Chip>Paused</Chip> : null}
          </div>
          {w.description ? <p className="mt-1 text-sm text-muted">{w.description}</p> : null}
        </div>
        <form action={toggleWorkflow}>
          <input type="hidden" name="id" value={w.id} />
          <button type="submit" role="switch" aria-checked={w.enabled} aria-label={w.enabled ? "Pause" : "Resume"} className={cn("relative mt-1 h-5 w-9 rounded-full transition-colors", w.enabled ? "bg-accent" : "bg-white/15")}>
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", w.enabled ? "left-[18px]" : "left-0.5")} />
          </button>
        </form>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="mono-label mb-1">Cadence</dt>
          <dd className="text-fg-2">{CADENCE_LABEL[w.cadence]}</dd>
        </div>
        <div>
          <dt className="mono-label mb-1">Persona</dt>
          <dd className="truncate text-fg-2">{persona?.name ?? "Any"}</dd>
        </div>
        <div>
          <dt className="mono-label mb-1">Channels</dt>
          <dd className="truncate text-fg-2">{w.channels.length ? w.channels.join(", ") : "Web"}</dd>
        </div>
      </dl>
      {w.sections.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {w.sections.map((s) => (
            <span key={s} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-fg-2">{s}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <form action={runWorkflow}>
          <input type="hidden" name="id" value={w.id} />
          <Button type="submit" className="px-3 py-1.5 text-xs">
            <Play className="size-3" aria-hidden /> Run now
          </Button>
        </form>
        <details className="group ml-1 flex-1">
          <summary className="cursor-pointer list-none text-xs text-muted hover:text-fg">Edit</summary>
          <div className="mt-4">
            <WorkflowForm w={w} personas={personas} />
          </div>
        </details>
        <form action={deleteWorkflow} className="self-start">
          <input type="hidden" name="id" value={w.id} />
          <button type="submit" className={cn(iconBtn, "hover:bg-red/10 hover:text-red")} aria-label={`Delete ${w.name}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </form>
      </div>
    </Card>
  );
}

function WorkflowForm({ w, personas }: { w?: Workflow; personas: Persona[] }) {
  return (
    <ActionForm action={saveWorkflow} submit={w ? "Save" : "Create"} variant={w ? "secondary" : "primary"}>
      {w ? <input type="hidden" name="id" value={w.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required defaultValue={w?.name} className={inputClass} placeholder="Monthly market note" />
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue={w?.kind ?? "agent"} className={inputClass}>
            <option value="agent">Recurring agent</option>
            <option value="format">Reusable format</option>
          </select>
        </Field>
        <Field label="Agent title" hint="For recurring agents.">
          <input name="agentTitle" list="agent-titles" defaultValue={w?.agentTitle ?? ""} className={inputClass} />
        </Field>
        <Field label="Cadence" hint="Formats are always on demand.">
          <select name="cadence" defaultValue={w?.cadence ?? "none"} className={inputClass}>
            {CADENCES.map((c) => (
              <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
            ))}
          </select>
        </Field>
      </div>
      <datalist id="agent-titles">
        {CUSTOM_AGENT_TITLES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <Field label="Description">
        <input name="description" defaultValue={w?.description} className={inputClass} />
      </Field>
      <Field label="Instructions" hint="What the Writer should do every time.">
        <textarea name="instructions" rows={3} defaultValue={w?.instructions} className={inputClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sections" hint="One per line.">
          <textarea name="sections" rows={4} defaultValue={w?.sections.join("\n")} className={inputClass} />
        </Field>
        <div className="space-y-3">
          <Field label="Persona">
            <select name="personaId" defaultValue={w?.personaId ?? ""} className={inputClass}>
              <option value="">Any reader</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <fieldset>
            <MonoLabel className="mb-2">Channels</MonoLabel>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {CHANNELS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-xs text-fg-2">
                  <input type="checkbox" name="channels" value={value} defaultChecked={w ? w.channels.includes(value) : value === "web"} className="accent-[var(--accent)]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </ActionForm>
  );
}
