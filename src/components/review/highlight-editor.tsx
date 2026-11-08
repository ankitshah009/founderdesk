"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { askEditor, type ActionState } from "@/app/actions";
import { cn } from "@/components/ui";

const QUICK = [
  ["Shorter", "Make this shorter"],
  ["More casual", "Make it more casual"],
  ["More formal", "Make it more formal"],
  ["As a list", "Turn this into a bullet list"],
  ["Remove", "Remove this"],
] as const;

/**
 * Highlight-and-ask: select a passage of the article, say what to change.
 * The rewrite becomes a new version that goes back through fact-check.
 */
export function HighlightEditor({ token, draftId, enabled, children }: { token: string; draftId: string; enabled: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLFormElement>(null);
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(askEditor, null);

  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      const s = window.getSelection();
      const container = box.current;
      if (!s || s.isCollapsed || !container || !s.rangeCount) return;
      const range = s.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const text = s.toString().replace(/\s+/g, " ").trim();
      if (text.length < 3) return;
      const r = range.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setSel({ text, top: r.bottom - c.top + 10, left: Math.max(0, Math.min(r.left - c.left, c.width - 340)) });
    };
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(read, 220);
    };
    const onDown = (e: MouseEvent) => {
      if (pop.current?.contains(e.target as Node)) return;
      setSel(null);
    };
    document.addEventListener("selectionchange", onChange);
    document.addEventListener("mousedown", onDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onChange);
      document.removeEventListener("mousedown", onDown);
    };
  }, [enabled]);

  return (
    <div ref={box} className="relative">
      {enabled ? (
        <p className="mb-2 flex items-center gap-2 text-xs text-muted">
          <Sparkles className="size-3.5 text-accent-ink" aria-hidden /> Highlight any passage to ask the editor for a change.
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="my-4 rounded-lg border border-green/30 bg-green/10 px-3 py-2.5 text-sm text-green">
          {state.ok}
        </p>
      ) : null}
      {children}
      {enabled && sel && !state?.ok ? (
        <form
          ref={pop}
          action={(f) => {
            action(f);
          }}
          style={{ top: sel.top, left: sel.left }}
          className="absolute z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-elev p-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)]"
        >
          <input type="hidden" name="t" value={token} />
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="selection" value={sel.text} />
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-xs text-muted">“{sel.text}”</p>
            <button type="button" onClick={() => setSel(null)} className="text-subtle hover:text-fg" aria-label="Close">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map(([label, text]) => (
              <button
                key={label}
                type="button"
                onClick={() => setInstruction(text)}
                className={cn("rounded-md px-2 py-1 text-[11px] transition-colors", instruction === text ? "bg-accent-tint text-accent-ink" : "bg-white/6 text-fg-2 hover:bg-white/10")}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            name="instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. replace “customers” with “teams”"
            className="w-full resize-none rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
          />
          {state?.error ? <p className="mt-1.5 text-xs text-red">{state.error}</p> : null}
          <button type="submit" disabled={pending || instruction.trim().length < 3} className="mt-2 w-full rounded-lg bg-white py-1.5 text-sm font-medium text-[#222] hover:bg-[#e8e8e8] disabled:opacity-50">
            {pending ? "Sending…" : "Ask the editor"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
