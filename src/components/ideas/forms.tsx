"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Bookmark, Newspaper } from "lucide-react";
import { addPost, checkNews, createIdea, importCsv, type IdeaActionState, type NewsState } from "@/app/studio/ideas/actions";
import type { Radar } from "@/lib/studio/ideas";
import { Button, Field, cn, inputClass } from "@/components/ui";
import { CSV_HEADER, PLATFORM_LABEL, POST_PLATFORM_LIST } from "./capture-helpers";
import { RadarView } from "./radar-view";


function Submit({ children, pending: label, variant = "primary", className }: { children: React.ReactNode; pending: string; variant?: "primary" | "secondary"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} aria-busy={pending}>
      {pending ? label : children}
    </Button>
  );
}

function Status({ state }: { state: IdeaActionState }) {
  if (!state) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={cn("text-sm", state.error ? "text-red" : "text-green")}>
      {state.error ?? state.ok}
    </p>
  );
}

function PlatformSelect({ name = "platform", defaultValue = "linkedin" }: { name?: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass}>
      {POST_PLATFORM_LIST.map((p) => (
        <option key={p} value={p}>
          {PLATFORM_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

export function NewIdeaForm() {
  const [state, action] = useActionState(createIdea, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="The idea, in one line" hint="Say the claim you want to make, not just the topic.">
        <input name="title" required minLength={8} maxLength={200} className={inputClass} placeholder="Most seed-stage startups hire sales too early" />
      </Field>
      <Field label="Notes" hint="Evidence, a story, numbers. The more specific, the better the analysis.">
        <textarea name="notes" rows={4} maxLength={10000} className={inputClass} placeholder="We hired our first AE at $400k ARR. Pipeline doubled, close rate halved…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Platform">
          <PlatformSelect />
        </Field>
        <Field label="Your own hooks (optional)" hint="One per line. They enter the Hook Tournament.">
          <textarea name="hooks" rows={2} maxLength={4000} className={inputClass} placeholder="We hired sales at $400k ARR. Here's what broke." />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Submit pending="Creating…">Analyze idea</Submit>
        <Status state={state} />
      </div>
    </form>
  );
}

export type PostDefaults = Partial<Record<"author" | "platform" | "url" | "text" | "date" | "likes" | "comments" | "shares" | "impressions" | "followers", string>>;

export function AddPostForm({ defaults = {}, via = "manual" }: { defaults?: PostDefaults; via?: "manual" | "bookmarklet" }) {
  const [state, action] = useActionState(addPost, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && via === "manual") formRef.current?.reset();
  }, [state, via]);
  const metric = (name: keyof PostDefaults, label: string) => (
    <Field label={label}>
      <input name={name} inputMode="numeric" defaultValue={defaults[name] ?? ""} className={inputClass} placeholder="0" />
    </Field>
  );
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="via" value={via} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Author" hint={`"me" for your own post, or the creator's @handle`}>
          <input name="author" defaultValue={defaults.author ?? "me"} required={via === "bookmarklet"} placeholder="@handle or me" maxLength={80} className={inputClass} />
        </Field>
        <Field label="Platform">
          <PlatformSelect defaultValue={defaults.platform ?? "linkedin"} />
        </Field>
        <Field label="Posted on">
          <input name="date" type="date" defaultValue={defaults.date ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="URL">
        <input name="url" type="url" defaultValue={defaults.url ?? ""} maxLength={2000} className={inputClass} placeholder="https://…" />
      </Field>
      <Field label="Post text">
        <textarea name="text" required rows={5} maxLength={5000} defaultValue={defaults.text ?? ""} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {metric("likes", "Likes")}
        {metric("comments", "Comments")}
        {metric("shares", "Shares")}
        {metric("impressions", "Impressions")}
        {metric("followers", "Followers")}
      </div>
      <p className="text-xs text-muted">Followers or impressions let the lab compare posts fairly across accounts of different sizes.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Submit pending="Saving…">Save post</Submit>
        <Status state={state} />
      </div>
    </form>
  );
}

export function CsvImportForm() {
  const [state, action] = useActionState(importCsv, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="rounded-xl border border-line bg-panel-2 px-3 py-2">
        <p className="text-xs text-muted">Expected header (any order; only text is required):</p>
        <code className="mt-1 block overflow-x-auto font-mono text-xs whitespace-nowrap text-accent-ink">{CSV_HEADER}</code>
      </div>
      <textarea
        name="csv"
        required
        rows={7}
        className={cn(inputClass, "font-mono text-xs")}
        placeholder={`${CSV_HEADER}\n"We cut onboarding from 9 steps to 3. Activation went up 41%.",me,linkedin,,2026-10-02,312,48,19,,8200`}
      />
      <p className="text-xs text-muted">Leave author empty (or write &quot;me&quot;) for your own posts. Most analytics exports can be pasted after renaming the header row.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Submit pending="Importing…">Import CSV</Submit>
        <Status state={state} />
      </div>
    </form>
  );
}

/** React refuses javascript: hrefs, so the bookmarklet's href is set on the DOM node after mount. */
export function CaptureBookmarklet({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      draggable
      className="inline-flex cursor-grab items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[#140a05] active:cursor-grabbing"
      title="Drag me to your bookmarks bar"
    >
      <Bookmark className="size-4" aria-hidden /> Capture post
    </a>
  );
}

export function NewsCheck({ ideaId, initial, live }: { ideaId: string; initial: Radar; live: boolean }) {
  const [state, action] = useActionState<NewsState, FormData>(checkNews, null);
  const radar = state?.radar ?? initial;
  return (
    <div className="space-y-6">
      <RadarView radar={radar} />
      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        {live ? (
          <form action={action}>
            <input type="hidden" name="ideaId" value={ideaId} />
            <Submit variant="secondary" pending="Searching the news…">
              <Newspaper className="size-4" aria-hidden /> Check news now
            </Submit>
          </form>
        ) : (
          <p className="text-sm text-muted">Connect Monid search for live news signals.</p>
        )}
        {state?.error ? (
          <p role="alert" className="text-sm text-red">
            {state.error}
          </p>
        ) : state?.checkedAt ? (
          <p role="status" className="text-sm text-muted">
            Checked {new Date(state.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Results are not saved.
          </p>
        ) : null}
      </div>
    </div>
  );
}
