"use client";

import { useActionState, useState } from "react";
import { approveArticle, editArticle, type ActionState } from "@/app/actions";
import { Button, Field, inputClass } from "@/components/ui";
import { BEST_TIMES, nextBestTime, suggestPlan, type Channel } from "@/lib/schedule";

const CHANNEL_LABEL: Record<string, string> = { web: "Web article", x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

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

export function ApprovePanel({ token, draftId, contentHash, destination, social, readyImages = [] }: Omit<Props, "draft">) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveArticle, null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [ticked, setTicked] = useState<string[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [bounds] = useState(() => {
    const now = new Date();
    return { min: localInputValue(now), max: localInputValue(new Date(now.getTime() + 60 * 86_400_000)) };
  });
  const channels = ["web", ...ticked];
  const parsed = (c: string) => {
    const v = times[c];
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const fmt = (d: Date) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const suggest = (cs: string[]) => {
    const plan = suggestPlan(cs as Channel[], new Date());
    setTimes(Object.fromEntries(Object.entries(plan).map(([k, d]) => [k, localInputValue(d)])));
  };
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...ticked, id] : ticked.filter((t) => t !== id);
    setTicked(next);
    if (when === "later" && on && !times[id]) {
      const web = parsed("web") ?? new Date();
      setTimes({ ...times, [id]: localInputValue(nextBestTime(id as Channel, new Date(web.getTime() + 30 * 60_000 - 1))) });
    }
  };
  const ready = when === "now" || channels.every((c) => parsed(c));
  const label = when === "later" && parsed("web") ? fmt(parsed("web")!) : null;
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
              <input type="checkbox" name="destinations" value={s.id} checked={ticked.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} className="accent-white" />
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
                  if (w === "later" && !Object.keys(times).length) suggest(channels);
                }}
                className="sr-only"
              />
              {w === "now" ? "Publish now" : "Schedule"}
            </label>
          ))}
        </div>
        {when === "later" ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-subtle">Your time ({zone}). Suggested from typical engagement for each platform.</p>
              <button type="button" onClick={() => suggest(channels)} className="shrink-0 text-xs font-semibold text-fg underline underline-offset-4">
                Use suggested times
              </button>
            </div>
            <ul className="space-y-2.5">
              {channels.map((c) => (
                <li key={c} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-fg">{CHANNEL_LABEL[c] ?? c}</span>
                    <input
                      type="datetime-local"
                      aria-label={`${CHANNEL_LABEL[c] ?? c} time`}
                      value={times[c] ?? ""}
                      min={bounds.min}
                      max={bounds.max}
                      onChange={(e) => setTimes({ ...times, [c]: e.target.value })}
                      className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-fg"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-subtle">{BEST_TIMES[c as Channel]?.why}</p>
                  {c !== "web" && parsed(c) && parsed("web") && parsed(c)! < parsed("web")! ? (
                    <p className="mt-1 text-[11px] text-amber">Before the article goes live, so it will post when the article is up.</p>
                  ) : null}
                  <input type="hidden" name={`at_${c}`} value={parsed(c)?.toISOString() ?? ""} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !ready} className="w-full py-2">
        {pending ? "Approving…" : when === "later" && label ? (ticked.length ? `Approve and schedule ${channels.length} channels` : `Approve and schedule for ${label}`) : "Approve and publish this version"}
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
