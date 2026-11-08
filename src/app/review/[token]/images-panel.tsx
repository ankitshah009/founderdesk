"use client";

import { useActionState } from "react";
import { generateImageAction, type ActionState } from "@/app/actions";

export function GenerateButton({ token, slot, label, disabled }: { token: string; slot: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(generateImageAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="slot" value={slot} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
      >
        {pending ? "Starting…" : label}
      </button>
      {state?.error ? <p className="mt-1 text-xs text-red">{state.error}</p> : null}
    </form>
  );
}
