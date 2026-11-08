"use client";

import { useActionState } from "react";
import { requestSignIn, type ActionState } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";

export function SignInForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestSignIn, null);
  if (state?.ok) {
    return (
      <div role="status" className="space-y-2 text-center">
        <p className="text-lg text-fg">Check your inbox</p>
        <p className="text-sm text-muted">{state.ok}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input name="email" type="email" required autoComplete="email" autoFocus className={inputClass} placeholder="you@company.com" />
      {state?.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full py-3">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
