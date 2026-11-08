"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Renders a time in the viewer's own timezone (server renders UTC as a fallback). */
export function LocalTime({ iso, withDate }: { iso: string; withDate?: boolean }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString(undefined, withDate ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" }),
    () => new Date(iso).toLocaleString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}
