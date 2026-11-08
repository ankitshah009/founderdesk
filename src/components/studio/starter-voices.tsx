"use client";

import { useActionState } from "react";
import { addStarterSample, type StudioState } from "@/app/studio/actions";
import { STARTER_VOICES } from "@/lib/studio/presets";

/** One-click starter voices for founders who haven't written anything yet. */
export function StarterVoices({ have }: { have: string[] }) {
  const [state, action, pending] = useActionState<StudioState, FormData>(addStarterSample, null);
  return (
    <div>
      <p className="mb-2 text-xs text-muted">No writing handy? Start from a built-in voice and replace it with your own later.</p>
      <form action={action} className="grid gap-2 sm:grid-cols-2">
        {STARTER_VOICES.map((v) => {
          const added = have.includes(`Starter voice: ${v.name}`);
          return (
            <button
              key={v.id}
              type="submit"
              name="starter"
              value={v.id}
              disabled={pending || added}
              className="rounded-lg border border-line bg-panel-2 p-3 text-left transition-colors hover:border-line-strong disabled:opacity-60"
            >
              <span className="flex items-center justify-between gap-2 text-sm text-fg">
                {v.name}
                <span className="text-[11px] text-accent-ink">{added ? "Added ✓" : "+ Use"}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">{v.blurb}</span>
            </button>
          );
        })}
      </form>
      {state?.ok ? <p className="mt-2 text-xs text-green">{state.ok}</p> : null}
      {state?.error ? <p className="mt-2 text-xs text-red">{state.error}</p> : null}
    </div>
  );
}
