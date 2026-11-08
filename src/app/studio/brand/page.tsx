import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/studio/action-form";
import { SetupProgress } from "@/components/studio/setup-progress";
import { StarterVoices } from "@/components/studio/starter-voices";
import { Card, PageHead, SignedOut, Skeleton, StatBar, timeAgo } from "@/components/studio/shared";
import { Button, Chip, Field, MonoLabel, inputClass } from "@/components/ui";
import type { Persona, VoiceProfile } from "@/lib/db/schema";
import { studioSession } from "@/lib/studio/session";
import { setupSteps } from "@/lib/studio/setup";
import { founderJobs, getProfile, listKnowledge } from "@/lib/studio/store";
import { termLines } from "@/lib/studio/style";
import { addSample, confirmPersonas, deleteKnowledge, deletePersona, savePersona, saveStyle } from "../actions";

export const metadata: Metadata = { title: "Brand & voice" };

export default function BrandPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <BrandVoice />
    </Suspense>
  );
}

const iconBtn = "grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-red/10 hover:text-red";

async function BrandVoice() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const [profile, knowledge, jobs] = await Promise.all([getProfile(session.email), listKnowledge(session.email), founderJobs(session.email)]);
  const samples = knowledge.filter((k) => k.kind === "sample");
  const g = profile.styleGuide;
  const steps = setupSteps(profile, { samples: samples.length, jobs: jobs.length });
  const personasDone = steps.find((s) => s.key === "personas")!.done;

  return (
    <>
      <PageHead label="Brand & voice" title="Sound like you, every time" lede="Writing samples teach the Writer your voice. The style guide and personas tell the Editor what to enforce and who you're writing for." />

      <SetupProgress steps={steps} current={["voice", "style", "personas"]} />

      <section id="voice" className="grid scroll-mt-28 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          <Card title="Writing samples" aside={<span className="text-xs text-muted">{samples.length} saved</span>}>
            {samples.length ? (
              <ul className="mb-6 divide-y divide-line rounded-xl border border-line">
                {samples.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{s.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{s.content.slice(0, 240)}</p>
                      <p className="mt-1 text-[11px] text-subtle">
                        {s.content.split(/\s+/).length.toLocaleString("en-US")} words · {timeAgo(s.createdAt)}
                        {s.url ? (
                          <>
                            {" · "}
                            <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-fg">source</a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <form action={deleteKnowledge}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className={iconBtn} aria-label={`Delete ${s.title}`}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">No samples yet. Add a piece or two you wrote yourself: posts, newsletters, long emails. Optional; drafts still work without it.</p>
            )}
            <div className="mb-6">
              <StarterVoices have={samples.map((s) => s.title)} />
            </div>
            <ActionForm action={addSample} submit="Add sample" pendingLabel="Learning…">
              <Field label="Link to something you wrote" hint="A blog post or newsletter issue. We fetch the page and keep the text.">
                <input name="url" type="text" inputMode="url" placeholder="https://yourblog.com/post" className={inputClass} />
              </Field>
              <Field label="Or paste text">
                <textarea name="text" rows={5} className={inputClass} placeholder="A post, newsletter or email you wrote. Any length; more writing gives a sharper profile." />
              </Field>
              <Field label="Title (optional)">
                <input name="title" className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </div>
        <VoiceCard voice={profile.voice} />
      </section>

      <section id="style" className="mt-10 scroll-mt-28">
        <Card title="Style guide">
          <ActionForm action={saveStyle} submit="Save style guide">
            <Field label="Tone" hint="How should it feel? e.g. Direct, warm, a little dry. No hype.">
              <input name="tone" defaultValue={g.tone} className={inputClass} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Preferred terms" hint={'One per line: "use = instead of, other". e.g. teams = customers, clients'}>
                <textarea name="terms" rows={6} defaultValue={termLines(g.preferredTerms)} className={`${inputClass} font-mono text-xs`} />
              </Field>
              <Field label="Banned phrases" hint="One per line. The Editor flags or removes them.">
                <textarea name="banned" rows={6} defaultValue={g.bannedPhrases.join("\n")} className={`${inputClass} font-mono text-xs`} />
              </Field>
              <Field label="Formatting rules" hint="One per line. e.g. Sentence-case headings.">
                <textarea name="formatting" rows={6} defaultValue={g.formatting.join("\n")} className={`${inputClass} font-mono text-xs`} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </section>

      <section id="personas" className="mt-10 scroll-mt-28">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-fg">Personas</h2>
          {personasDone ? (
            <span className="text-xs text-green">✓ Personas set</span>
          ) : (
            <form action={confirmPersonas} className="flex items-center gap-3">
              <span className="text-xs text-muted">Who each article is written for</span>
              <Button type="submit">These look right</Button>
            </form>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {profile.personas.map((p) => (
            <PersonaCard key={p.id} persona={p} />
          ))}
          <Card title="Add a persona" className="border-dashed">
            <PersonaForm />
          </Card>
        </div>
      </section>
    </>
  );
}

function VoiceCard({ voice }: { voice: VoiceProfile | null }) {
  if (!voice) {
    return (
      <Card title="Voice profile">
        <p className="text-sm text-muted">Add a writing sample (or a starter voice) and we&apos;ll measure your voice: sentence length, contractions, first person, questions and reading ease.</p>
      </Card>
    );
  }
  return (
    <Card title="Voice profile" aside={<span className="text-xs text-muted">{voice.sampleCount} sample{voice.sampleCount === 1 ? "" : "s"} · {voice.words.toLocaleString("en-US")} words</span>} className="h-fit lg:sticky lg:top-24">
      <div className="flex flex-wrap gap-1.5">
        {voice.traits.map((t) => (
          <Chip key={t} tone="accent">{t}</Chip>
        ))}
      </div>
      <div className="mt-6 space-y-4">
        <StatBar label="Avg sentence length" value={voice.avgSentenceLength} max={35} display={`${voice.avgSentenceLength} words`} delay={0} />
        <StatBar label="Contractions" value={voice.contractionRate} max={4} display={`${voice.contractionRate} / 100 words`} delay={80} />
        <StatBar label="First person" value={voice.firstPersonRate} max={8} display={`${voice.firstPersonRate} / 100 words`} delay={160} />
        <StatBar label="Questions" value={voice.questionRate * 100} max={20} display={`${Math.round(voice.questionRate * 100)}% of sentences`} delay={240} />
        <StatBar label="Reading ease" value={voice.readingEase} max={100} display={`${Math.round(voice.readingEase)}`} hint="Flesch score: 60+ reads plainly, under 40 is dense." delay={320} />
      </div>
      {voice.signaturePhrases.length ? (
        <div className="mt-6">
          <MonoLabel className="mb-2">Signature phrases</MonoLabel>
          <div className="flex flex-wrap gap-1.5">
            {voice.signaturePhrases.map((p) => (
              <span key={p} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg-2">&ldquo;{p}&rdquo;</span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-6 text-[11px] text-subtle">Re-learned {timeAgo(new Date(voice.analyzedAt))} from every sample you&apos;ve saved.</p>
    </Card>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-fg">{persona.name}</p>
          <p className="mt-1 text-sm text-muted">{persona.description}</p>
        </div>
        <form action={deletePersona}>
          <input type="hidden" name="id" value={persona.id} />
          <button type="submit" className={iconBtn} aria-label={`Delete ${persona.name}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </form>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {persona.cares ? (
          <div>
            <dt className="mono-label mb-1">Cares about</dt>
            <dd className="text-fg-2">{persona.cares}</dd>
          </div>
        ) : null}
        {persona.avoid ? (
          <div>
            <dt className="mono-label mb-1">Avoid</dt>
            <dd className="text-fg-2">{persona.avoid}</dd>
          </div>
        ) : null}
      </dl>
      <details className="group mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-fg">Edit</summary>
        <div className="mt-3">
          <PersonaForm persona={persona} />
        </div>
      </details>
    </Card>
  );
}

function PersonaForm({ persona }: { persona?: Persona }) {
  return (
    <ActionForm action={savePersona} submit={persona ? "Save persona" : "Add persona"} variant={persona ? "secondary" : "primary"}>
      {persona ? <input type="hidden" name="originalId" value={persona.id} /> : null}
      <Field label="Name">
        <input name="name" required defaultValue={persona?.name} className={inputClass} placeholder="Seed-stage CTO" />
      </Field>
      <Field label="Who they are">
        <textarea name="description" rows={2} defaultValue={persona?.description} className={inputClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cares about">
          <input name="cares" defaultValue={persona?.cares} className={inputClass} />
        </Field>
        <Field label="Avoid">
          <input name="avoid" defaultValue={persona?.avoid} className={inputClass} />
        </Field>
      </div>
    </ActionForm>
  );
}
