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
  draft: { title: string; dek: string; bodyMarkdown: string; announcement: string };
};

export function ApprovePanel({ token, draftId, contentHash, destination, social }: Omit<Props, "draft">) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveArticle, null);
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
          <label key={s.id} className="flex items-center gap-2.5 text-fg-2">
            <input type="checkbox" name="destinations" value={s.id} className="accent-white" />
            Announce on {s.label}
          </label>
        ))}
      </fieldset>
      {state?.error ? (
        <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full py-2">
        {pending ? "Approving…" : "Approve and publish this version"}
      </Button>
      <p className="text-xs leading-relaxed text-subtle">Your approval is recorded against this exact version (sha256 {contentHash.slice(0, 10)}…) and these destinations.</p>
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
