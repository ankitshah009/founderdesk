import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { ActionForm } from "@/components/studio/action-form";
import { SetupProgress } from "@/components/studio/setup-progress";
import { StarterVoices } from "@/components/studio/starter-voices";
import { Card, PageHead, SignedOut, Skeleton } from "@/components/studio/shared";
import { Button, Chip, Field, MonoLabel, inputClass } from "@/components/ui";
import type { Brand } from "@/lib/db/schema";
import { studioSession } from "@/lib/studio/session";
import { setupSteps } from "@/lib/studio/setup";
import { founderJobs, getProfile, listKnowledge } from "@/lib/studio/store";
import { captureBrand, finishOnboarding, saveBrand } from "../actions";

export const metadata: Metadata = { title: "Onboarding" };

export default function OnboardingPage(props: PageProps<"/studio/onboarding">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Onboarding searchParams={props.searchParams} />
    </Suspense>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid size-7 place-items-center rounded-full border border-line-strong text-xs font-semibold tabular-nums text-fg">{n}</span>
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {children}
    </div>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/studio/onboarding">["searchParams"] }) {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const sp = await searchParams;
  const { safeNext } = await import("@/lib/auth-google");
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/studio");
  const toArticle = next.startsWith("/start");
  const missingBrand = sp.missing === "brand";
  const [profile, knowledge, jobs] = await Promise.all([getProfile(session.email), listKnowledge(session.email), founderJobs(session.email)]);
  const brand = profile.brand;
  const samples = knowledge.filter((k) => k.kind === "sample").length;
  const steps = setupSteps(profile, { samples, jobs: jobs.length });

  return (
    <>
      <PageHead
        label="Onboarding"
        title="Teach the desk your company"
        lede="Point us at your website, a deck or a few paragraphs. We read it, show you what we captured, and you correct anything we got wrong."
      >
        {profile.onboardedAt ? <Chip tone="green">Onboarded</Chip> : null}
      </PageHead>

      {toArticle && !profile.onboardedAt ? (
        <p role="status" className="mb-6 rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-fg">
          Optional, about two minutes: tell the desk about your company so your article sounds like you. Share as much as you like, or skip straight to your article.
        </p>
      ) : null}
      {missingBrand ? (
        <p role="alert" className="mb-6 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Add your website, a document or a paragraph about your company in step 1 first. The desk needs it to write for you.
        </p>
      ) : null}

      <SetupProgress steps={steps} current={["brand", "voice"]} />

      <section className="mb-10">
        <Step n={1} title="Tell us about your company" />
        <Card>
          <ActionForm action={captureBrand} submit={brand ? "Capture more" : "Capture my brand"} pendingLabel="Reading…">
            <div className="grid gap-5 md:grid-cols-3">
              <Field label="Company website" hint="We read the homepage: name, tagline, colours, logo, products.">
                <input name="url" type="text" inputMode="url" placeholder="acme.com" className={inputClass} defaultValue={brand?.website ?? ""} />
              </Field>
              <Field label="Upload a document" hint="Deck, one-pager or brand book. PDF, .txt or .md, up to 15 MB.">
                <input name="file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-fg`} />
              </Field>
              <Field label="Or paste text" hint="An About page, a pitch, a founding story.">
                <textarea name="text" rows={3} className={inputClass} placeholder="We help…" />
              </Field>
            </div>
            <p className="text-xs text-subtle">Use any one, or all three. Nothing is invented: fields stay empty when your material doesn&apos;t say.</p>
          </ActionForm>
        </Card>
      </section>

      {brand ? (
        <section className="mb-10">
          <Step n={2} title="Here's what we captured">
            <span className="ml-auto text-xs text-subtle">From {brand.sources.join(", ")}</span>
          </Step>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <BrandPreview brand={brand} />
            <Card title="Correct anything">
              <BrandForm brand={brand} />
            </Card>
          </div>
        </section>
      ) : null}

      <section className="mb-10">
        <Step n={brand ? 3 : 2} title="Teach it your voice" />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted">
              {samples
                ? `${samples} writing sample${samples === 1 ? "" : "s"} saved. Add a few posts, newsletters or emails you wrote yourself so drafts sound like you, not like marketing copy.`
                : "Paste a few posts, newsletters or emails you wrote yourself. The writer matches your sentence length, contractions and signature phrases."}
            </p>
            <Link href="/studio/brand#voice" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink hover:text-accent">
              Paste your own <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-5 border-t border-line pt-5">
            <StarterVoices have={knowledge.filter((k) => k.kind === "sample").map((k) => k.title)} />
          </div>
        </Card>
      </section>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <form action={finishOnboarding}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit">
            {profile.onboardedAt ? (toArticle ? "Continue to your article" : "Back to overview") : brand ? (toArticle ? "Finish and start my article" : "Finish setup") : toArticle ? "Skip to my article" : "Skip for now"}
          </Button>
        </form>
        {!brand ? <span className="text-sm text-muted">Everything here is optional. You can add it any time from the Studio.</span> : null}
      </div>
    </>
  );
}

function BrandPreview({ brand }: { brand: Brand }) {
  return (
    <Card className="lv-rise">
      <div className="flex items-start gap-4">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo host
          <img src={brand.logoUrl} alt={`${brand.name ?? "Company"} logo`} className="size-14 shrink-0 rounded-xl border border-line bg-white/[0.04] object-contain p-1.5" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.04] text-lg font-semibold text-fg">{(brand.name ?? "?").slice(0, 1)}</span>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-fg">{brand.name ?? <span className="text-subtle">No name found</span>}</p>
          {brand.tagline ? <p className="mt-0.5 text-sm text-fg-2">{brand.tagline}</p> : null}
          {brand.website ? (
            <a href={brand.website} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-muted hover:text-fg">{brand.website}</a>
          ) : null}
        </div>
      </div>
      {brand.description ? <p className="mt-5 text-sm leading-relaxed text-muted">{brand.description}</p> : null}
      <dl className="mt-6 space-y-5">
        {brand.colors.length ? (
          <div>
            <MonoLabel className="mb-2">Colours</MonoLabel>
            <div className="flex flex-wrap gap-2">
              {brand.colors.map((c, i) => (
                <span key={c} className="lv-pop flex items-center gap-2 rounded-md border border-line px-2 py-1 text-xs tabular-nums text-fg-2" style={{ "--d": `${i * 60}ms` } as React.CSSProperties}>
                  <span className="size-4 rounded-sm ring-1 ring-inset ring-white/15" style={{ background: c }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {brand.audience ? (
          <div>
            <MonoLabel className="mb-2">Audience</MonoLabel>
            <p className="text-sm text-fg-2">{brand.audience}</p>
          </div>
        ) : null}
        {brand.products.length ? (
          <div>
            <MonoLabel className="mb-2">Products</MonoLabel>
            <ul className="space-y-1 text-sm text-fg-2">
              {brand.products.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {brand.keywords.length ? (
          <div>
            <MonoLabel className="mb-2">Key terms</MonoLabel>
            <div className="flex flex-wrap gap-1.5">
              {brand.keywords.map((k) => (
                <Chip key={k}>{k}</Chip>
              ))}
            </div>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

function BrandForm({ brand }: { brand: Brand }) {
  return (
    <ActionForm action={saveBrand} submit="Save brand">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name">
          <input name="name" defaultValue={brand.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Tagline">
          <input name="tagline" defaultValue={brand.tagline ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" rows={3} defaultValue={brand.description ?? ""} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input name="website" defaultValue={brand.website ?? ""} className={inputClass} placeholder="https://" />
        </Field>
        <Field label="Logo image URL">
          <input name="logoUrl" defaultValue={brand.logoUrl ?? ""} className={inputClass} placeholder="https://" />
        </Field>
      </div>
      <Field label="Colours" hint="Hex codes, separated by spaces or commas.">
        <input name="colors" defaultValue={brand.colors.join(", ")} className={inputClass} />
      </Field>
      <Field label="Audience">
        <input name="audience" defaultValue={brand.audience ?? ""} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Products" hint="One per line.">
          <textarea name="products" rows={3} defaultValue={brand.products.join("\n")} className={inputClass} />
        </Field>
        <Field label="Key terms" hint="Comma-separated.">
          <textarea name="keywords" rows={3} defaultValue={brand.keywords.join(", ")} className={inputClass} />
        </Field>
      </div>
    </ActionForm>
  );
}
