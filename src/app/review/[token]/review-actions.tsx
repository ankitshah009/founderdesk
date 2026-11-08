"use client";

import { useActionState, useState } from "react";
import { approveArticle, editArticle, type ActionState } from "@/app/actions";
import { Button, Field, inputClass } from "@/components/ui";

type Props = {
  token: string;
  draftId: string;
  contentHash: string;
  destination: string;
  social: Array<{ id: string; label: string }>;
  readyImages?: Array<{ id: string; slot: string; preselected: boolean }>;
  draft: { title: string; dek: string; bodyMarkdown: string; announcement: string };
};

function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Tomorrow 9:00 in the founder's own timezone — the default slot. */
function defaultSlot(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function ApprovePanel({ token, draftId, contentHash, destination, social, readyImages = [] }: Omit<Props, "draft">) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveArticle, null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [local, setLocal] = useState<string>("");
  const [bounds] = useState(() => {
    const now = new Date();
    return { min: localInputValue(now), max: localInputValue(new Date(now.getTime() + 60 * 86_400_000)) };
  });
  const at = local ? new Date(local) : null;
  const label = at && !Number.isNaN(at.getTime()) ? at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const zone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  if (state?.ok) {
    return (
      <p role="status" className="rounded-lg border border-green/30 bg-green/10 px-3 py-2.5 text-sm text-green">
        {state.ok}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="contentHash" value={contentHash} />
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 text-xs text-muted">Publish to</legend>
        <label className="flex items-start gap-2.5 text-fg-2">
          <input type="checkbox" checked disabled className="mt-0.5 accent-white" />
          <span>
            Web article
            <span className="block break-all text-xs text-subtle">{destination}</span>
          </span>
        </label>
        {social.map((s) => (
          <div key={s.id}>
            <label className="flex items-center gap-2.5 text-fg-2">
              <input type="checkbox" name="destinations" value={s.id} className="accent-white" />
              Announce on {s.label}
            </label>
            {s.id === "x" ? (
              <div className="mt-2 ml-6 flex gap-4 text-xs text-fg-2" role="radiogroup" aria-label="X format">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="xFormat" value="single" defaultChecked className="accent-white" /> One post
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="xFormat" value="thread" className="accent-white" /> Thread
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </fieldset>
      {readyImages.length ? (
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2 text-xs text-muted">Images to publish (unticked images stay private)</legend>
          <div className="grid grid-cols-3 gap-2">
            {readyImages.map((img) => (
              <label key={img.id} className="relative block cursor-pointer overflow-hidden rounded-lg border border-line has-[:checked]:border-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/images/${img.id}`} alt="" className="aspect-[3/2] w-full object-cover" />
                <span className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-fg-2">
                  <input type="checkbox" name="imageIds" value={img.id} defaultChecked={img.preselected} className="accent-white" />
                  <span className="truncate">{img.slot === "hero" ? "Header" : img.slot}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 text-xs text-muted">When</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(["now", "later"] as const).map((w) => (
            <label key={w} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 ${when === w ? "border-accent bg-accent-tint text-fg" : "border-line text-fg-2"}`}>
              <input
                type="radio"
                name="when"
                value={w}
                checked={when === w}
                onChange={() => {
                  setWhen(w);
                  if (w === "later" && !local) setLocal(localInputValue(defaultSlot()));
                }}
                className="sr-only"
              />
              {w === "now" ? "Publish now" : "Schedule"}
            </label>
          ))}
        </div>
        {when === "later" ? (
          <div className="space-y-1.5 pt-1">
            <input
              type="datetime-local"
              aria-label="Publish at"
              value={local}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg"
            />
            <p className="text-xs text-subtle">Your time ({zone}). The article and every post you ticked go out together. You can publish early or cancel until then.</p>
            <input type="hidden" name="publishAt" value={at && !Number.isNaN(at.getTime()) ? at.toISOString() : ""} />
          </div>
        ) : null}
      </fieldset>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || (when === "later" && !label)} className="w-full py-2">
        {pending ? "Approving…" : when === "later" && label ? `Approve and schedule for ${label}` : "Approve and publish this version"}
      </Button>
      <p className="text-xs leading-relaxed text-subtle">Your approval is recorded against this exact version (sha256 {contentHash.slice(0, 10)}…) and these destinations, plus the images you ticked.</p>
    </form>
  );
}

export function EditPanel({ token, draftId, draft }: Pick<Props, "token" | "draftId" | "draft">) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(editArticle, null);
  if (state?.ok) return <p className="text-sm text-green">{state.ok}</p>;
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full py-2" onClick={() => setOpen(true)}>
        Edit the text
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="draftId" value={draftId} />
      <Field label="Headline">
        <input name="title" defaultValue={draft.title} className={inputClass} />
      </Field>
      <Field label="Standfirst">
        <textarea name="dek" rows={2} defaultValue={draft.dek} className={inputClass} />
      </Field>
      <Field label="Article (Markdown)" hint="Keep [S1]-style citations next to claims.">
        <textarea name="body" rows={18} defaultValue={draft.bodyMarkdown} className={`${inputClass} font-mono text-xs leading-relaxed`} />
      </Field>
      <Field label="Announcement" hint="{{url}} is replaced with the article link.">
        <textarea name="announcement" rows={3} defaultValue={draft.announcement} className={inputClass} />
      </Field>
      {state?.error ? (
        <p role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save as new version"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
