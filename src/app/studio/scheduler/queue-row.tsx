"use client";

import { useActionState, useState } from "react";
import { queueAction, type QueueActionState } from "./actions";

const LABEL: Record<string, string> = { web: "Article goes live", x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function QueueRow({ jobId, destination, title, at }: { jobId: string; destination: string; title: string; at: string }) {
  const [state, act, pending] = useActionState<QueueActionState, FormData>(queueAction, null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => localInput(new Date(at)));
  const when = new Date(at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="destination" value={destination} />
      <input type="hidden" name="op" value={op} />
    </>
  );
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">
          {LABEL[destination] ?? destination} <span className="font-normal text-fg-2">· {when}</span>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">{title}</p>
        {state?.ok || state?.error ? <p className={`mt-1 text-xs ${state.error ? "text-red" : "text-green"}`}>{state.error ?? state.ok}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {editing ? (
          <form action={act} className="flex items-center gap-1.5" onSubmit={() => setEditing(false)}>
            {hidden("move")}
            <input type="datetime-local" aria-label="New time" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-fg" />
            <input type="hidden" name="at" value={value ? new Date(value).toISOString() : ""} />
            <button disabled={pending} className="rounded-md bg-white px-2.5 py-1 font-medium text-black disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="px-1.5 py-1 text-fg-2">Cancel</button>
          </form>
        ) : (
          <>
            <form action={act}>
              {hidden("now")}
              <button disabled={pending} className="rounded-md bg-accent px-2.5 py-1 font-semibold text-[#140a05] disabled:opacity-50">Post now</button>
            </form>
            <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-line px-2.5 py-1 text-fg-2 hover:text-fg">
              Reschedule
            </button>
            {destination !== "web" ? (
              <form action={act}>
                {hidden("cancel")}
                <button disabled={pending} className="rounded-md px-2 py-1 text-fg-2 hover:text-red disabled:opacity-50">Remove</button>
              </form>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
