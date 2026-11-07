"use client";

import { useActionState } from "react";
import { deskLogin, deskReply, simulateInbound, type ActionState } from "@/app/actions";
import { Button, Field, inputClass } from "@/components/ui";

const DEMO_NOTES = `Hi,

I want to write about why founders should start with narrow support workflows. Here are my notes and a pilot report. My audience is early-stage SaaS founders. Please keep the customer names private.

- We piloted with Acme Robotics and saw first-response time improved by 80% in six weeks.
- Narrow AI support workflows work for all companies, according to the pilot report.
- Starting with password resets and refunds kept escalation rates low for our team.

Thanks,
Dana`;

const DEMO_REPORT = `Pilot report: AI-assisted support triage.
Across the 42 B2B SaaS companies in the pilot, median first-response time improved by 60% after routing password resets and refund requests to narrow AI workflows.
Companies that automated every ticket type at once saw escalation rates rise by 12% during the same period.
The pilot was limited to companies with fewer than 200 employees, so results may not generalize to larger support organizations.
Narrow AI support workflows reduced first-response time for the companies in the pilot without increasing escalations.`;

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={state.error ? "text-sm text-red" : "text-sm text-green"}>
      {state.error ?? state.ok}
    </p>
  );
}

export function SimulateInboundForm({ inbox }: { inbox: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(simulateInbound, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From">
          <input name="from" defaultValue="Dana Reyes <dana@northwind.dev>" className={inputClass} />
        </Field>
        <Field label="To">
          <input value={inbox} readOnly className={`${inputClass} text-muted`} />
        </Field>
      </div>
      <Field label="Subject">
        <input name="subject" defaultValue="Article on AI customer support" className={inputClass} />
      </Field>
      <Field label="Message">
        <textarea name="text" rows={10} defaultValue={DEMO_NOTES} className={`${inputClass} leading-relaxed`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Attachment name">
          <input name="attachmentName" defaultValue="pilot-report.txt" className={inputClass} />
        </Field>
        <Field label="Attachment text">
          <textarea name="attachmentText" rows={4} defaultValue={DEMO_REPORT} className={`${inputClass} text-xs`} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Delivering…" : "Deliver email"}
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ReplyForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deskReply, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <textarea name="text" rows={3} className={inputClass} placeholder="Use the supported figure from the report — 60% is right." />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Recording…" : "Record founder reply"}
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(deskLogin, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Desk token">
        <input name="token" type="password" autoComplete="current-password" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        Open the desk
      </Button>
      <Status state={state} />
    </form>
  );
}
