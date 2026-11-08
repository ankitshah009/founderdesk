"use client";

import { useActionState, type ReactNode } from "react";
import type { StudioState } from "@/app/studio/actions";
import { Button, cn } from "@/components/ui";

type Action = (prev: StudioState, form: FormData) => Promise<StudioState>;

/** A form bound to a Studio server action, showing pending state and the action's error or confirmation. */
export function ActionForm({
  action,
  submit,
  pendingLabel,
  children,
  className,
  variant = "primary",
}: {
  action: Action;
  submit: string;
  pendingLabel?: string;
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={cn("space-y-4", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? (pendingLabel ?? "Saving…") : submit}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-sm text-red">{state.error}</p>
        ) : state?.ok ? (
          <p role="status" className="text-sm text-green">{state.ok}</p>
        ) : null}
      </div>
    </form>
  );
}
