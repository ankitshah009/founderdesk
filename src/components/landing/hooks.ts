"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True when the visitor asked for less motion. False on the server. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Whether the element is on screen. Used to run demos only while they can be seen. */
export function useInView(ref: RefObject<Element | null>, rootMargin = "0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/**
 * Steps through 0..count-1 while `running`, waiting `durations[i]` ms on each
 * step (or a fixed ms for all), then loops.
 */
export function useCycle(count: number, durations: number | readonly number[], running: boolean) {
  const [i, setI] = useState(0);
  const wait = typeof durations === "number" ? durations : durations[i % durations.length];
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setI((x) => (x + 1) % count), wait);
    return () => window.clearTimeout(t);
  }, [i, running, count, wait]);
  return [i, setI] as const;
}
