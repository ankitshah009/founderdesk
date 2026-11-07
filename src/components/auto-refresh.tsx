"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While an order is in progress, nudge the workflow (an idempotent, leased
 * tick) and re-render the page. Stops when the order no longer needs it.
 */
export function AutoRefresh({ tickUrl, active, everyMs = 4000 }: { tickUrl: string; active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const run = async () => {
      try {
        await fetch(tickUrl, { method: "POST" });
      } catch {
        /* the next tick will retry */
      }
      if (!stopped) router.refresh();
    };
    const id = setInterval(run, everyMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, everyMs, router, tickUrl]);
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      <span className="size-1.5 rounded-full bg-blue pulse-dot" aria-hidden />
      Updating live
    </span>
  ) : null;
}
