"use client";

import { useActionState } from "react";
import { simulatedGoogleSignIn } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

export function SimForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(simulatedGoogleSignIn, null);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-sm text-fg-2">Google account email</span>
        <input name="email" type="email" required autoFocus className={inputClass} placeholder="you@gmail.com" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-fg-2">Name</span>
        <input name="name" className={inputClass} placeholder="Dana Reyes" />
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}
