"use client";

import { useActionState, useState } from "react";
import { Check, Globe, PenLine, Sparkles } from "lucide-react";
import { startArticle, startFromIdea, suggestIdeasAction, type ActionState, type IdeasState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

/**
 * One box first (what you want to say), then where to reach you. Title, links
 * and privacy notes are optional and tucked away — the brief parser finds the
 * thesis, audience, links and boundaries in the notes themselves.
 */
function NotesForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(startArticle, null);
  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="sr-only">Your notes</span>
        <textarea
          name="notes"
          required
          rows={10}
          autoFocus
          className={`${inputClass} resize-y rounded-2xl p-5 text-base leading-relaxed`}
          placeholder={
            "What do you want to argue, and who is it for?\n\nE.g. I want to write about why founders should start with narrow support workflows. My audience is early-stage SaaS founders. We cut first-response time by 60% in six weeks. Paste links anywhere in here."
          }
        />
      </label>
      <details className="group rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none text-fg-2 group-open:mb-3">+ Add a title, links or privacy notes (optional)</summary>
        <div className="space-y-3">
          <input name="subject" className={inputClass} placeholder="Working title" />
          <textarea name="links" rows={2} className={`${inputClass} font-mono text-xs`} placeholder="Links, one per line" />
          <input name="boundaries" className={inputClass} placeholder="e.g. Please keep customer names private." />
        </div>
      </details>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input name="email" type="email" required autoComplete="email" className={`${inputClass} sm:flex-1`} placeholder="Your email — we send the draft here" />
        <input name="name" autoComplete="name" className={`${inputClass} sm:w-48`} placeholder="Name (optional)" />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} className="px-6 py-3 text-base">
          {pending ? "Starting…" : "Continue — first article free"}
        </Button>
        <span className="text-sm text-muted">Nothing publishes without your approval.</span>
      </div>
    </form>
  );
}

/**
 * Default start: paste your website, we suggest arguments only you can make,
 * pick one, leave your email. The notes form stays one tap away.
 */
export function StartForm() {
  const [mode, setMode] = useState<"site" | "notes">("site");
  return (
    <div>
      <div role="tablist" aria-label="How to start" className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line p-1 text-sm">
        {(
          [
            ["site", "Start from my website", Globe],
            ["notes", "I know what to argue", PenLine],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 ${mode === m ? "bg-white/[0.08] font-semibold text-fg" : "text-fg-2 hover:text-fg"}`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {mode === "site" ? <WebsiteStart /> : <NotesForm />}
    </div>
  );
}

function WebsiteStart() {
  const [ideas, suggest, thinking] = useActionState<IdeasState, FormData>(suggestIdeasAction, null);
  const [started, start, starting] = useActionState<ActionState, FormData>(startFromIdea, null);
  const [picked, setPicked] = useState(0);
  const result = ideas?.result;

  return (
    <div className="space-y-6">
      <form action={suggest} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fg">Your company website</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="website"
              required
              autoFocus
              inputMode="url"
              autoComplete="url"
              defaultValue={ideas?.url ?? ""}
              placeholder="acme.com"
              className={`${inputClass} text-base sm:flex-1`}
            />
            <Button type="submit" disabled={thinking} className="px-5 py-2.5">
              <Sparkles className="size-4" aria-hidden /> {thinking ? "Reading your site…" : result ? "Suggest again" : "Suggest what to write"}
            </Button>
          </div>
        </label>
        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-fg-2 group-open:mb-2">+ Anything we should know? (optional)</summary>
          <textarea name="note" rows={2} className={inputClass} placeholder="e.g. We just raised a seed round; our buyers are heads of support at B2B SaaS companies." />
        </details>
        {thinking ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden /> Reading your website and finding arguments only you can make — about 10 seconds.
          </p>
        ) : null}
        {ideas?.error ? (
          <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
            {ideas.error}
          </p>
        ) : null}
      </form>

      {result && !thinking ? (
        <form action={start} className="space-y-5 border-t border-line pt-6">
          <input type="hidden" name="website" value={ideas?.url ?? ""} />
          <input type="hidden" name="pick" value={JSON.stringify({ company: result.company, idea: result.ideas[picked] })} />
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
            <p className="text-fg">
              <span className="font-semibold">{result.company.name}</span> — {result.company.oneLiner}
            </p>
            <p className="mt-1 text-xs text-muted">
              For {result.company.audience} · Voice: {result.company.voice}
            </p>
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-fg">Pick an argument to make</legend>
            <div className="space-y-2.5" role="radiogroup">
              {result.ideas.map((idea, i) => (
                <label
                  key={idea.title}
                  className={`block cursor-pointer rounded-xl border p-4 transition-colors ${picked === i ? "border-accent bg-accent-tint" : "border-line hover:border-white/25"}`}
                >
                  <input type="radio" name="idea" checked={picked === i} onChange={() => setPicked(i)} className="sr-only" />
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-[15px] font-semibold text-fg">{idea.title}</span>
                    {picked === i ? <Check className="size-4 shrink-0 text-accent" aria-hidden /> : null}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-fg-2">{idea.argument}</span>
                  <span className="mt-2 block text-xs text-muted">
                    For {idea.audience} · {idea.why}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1.5 block text-fg-2">Add your own experience (optional, makes it much better)</span>
            <textarea name="angle" rows={3} className={inputClass} placeholder="A number, a customer story, something you tried that didn't work…" />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input name="email" type="email" required autoComplete="email" className={`${inputClass} sm:flex-1`} placeholder="Your email — we send the draft here" />
            <input name="name" autoComplete="name" className={`${inputClass} sm:w-48`} placeholder="Name (optional)" />
          </div>
          {started?.error ? (
            <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {started.error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={starting} className="px-6 py-3 text-base">
              {starting ? "Starting…" : "Write this — first article free"}
            </Button>
            <span className="text-sm text-muted">Researched, cited, and nothing publishes without your OK.</span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
