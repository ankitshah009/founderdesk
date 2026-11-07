"use client";

import { useActionState } from "react";
import { startArticle, type ActionState } from "@/app/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function StartForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(startArticle, null);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name">
          <input name="name" autoComplete="name" className={inputClass} placeholder="Dana Reyes" />
        </Field>
        <Field label="Email" hint="We reply here, and your replies land on this order.">
          <input name="email" type="email" required autoComplete="email" className={inputClass} placeholder="dana@company.com" />
        </Field>
      </div>
      <Field label="Working title">
        <input name="subject" required className={inputClass} placeholder="Article on AI customer support" />
      </Field>
      <Field label="Your notes" hint="What you want to argue, who it's for, and what you've seen first-hand. Numbers are welcome — we'll check them.">
        <textarea
          name="notes"
          required
          rows={9}
          className={`${inputClass} resize-y leading-relaxed`}
          placeholder={"I want to write about why founders should start with narrow support workflows. My audience is early-stage SaaS founders.\n\n- We saw first-response time improve by 60% in six weeks.\n- …"}
        />
      </Field>
      <Field label="Links (optional)" hint="One per line. We fetch them and quote only what they actually say.">
        <textarea name="links" rows={3} className={`${inputClass} resize-y font-mono text-xs`} placeholder="https://…" />
      </Field>
      <Field label="Boundaries (optional)">
        <input name="boundaries" className={inputClass} placeholder="Please keep the customer names private." />
      </Field>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating your order…" : "Continue to payment"}
        </Button>
        <span className="text-xs text-muted">$49 · nothing publishes without your approval</span>
      </div>
    </form>
  );
}
