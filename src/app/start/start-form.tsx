"use client";

import { useActionState } from "react";
import { startArticle, type ActionState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

/**
 * One box first (what you want to say), then where to reach you. Title, links
 * and privacy notes are optional and tucked away — the brief parser finds the
 * thesis, audience, links and boundaries in the notes themselves.
 */
export function StartForm() {
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
          {pending ? "Starting…" : "Continue — $9"}
        </Button>
        <span className="text-sm text-muted">Nothing publishes without your approval.</span>
      </div>
    </form>
  );
}
