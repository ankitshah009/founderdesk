"use client";

import { useEffect } from "react";

/** Counts a view on open and a read at 75% scroll, once per page load, via our own endpoint. */
export function ReadBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const send = (event: "view" | "read") => {
      const body = JSON.stringify({ slug, event });
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => undefined);
      }
    };
    send("view");
    let read = false;
    const onScroll = () => {
      const el = document.documentElement;
      if (!read && (window.scrollY + window.innerHeight) / el.scrollHeight >= 0.75) {
        read = true;
        send("read");
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);
  return null;
}
