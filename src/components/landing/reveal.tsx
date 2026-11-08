"use client";

import { useEffect } from "react";

/**
 * Arms every [data-reveal] element that starts below the fold and reveals it
 * when it scrolls into view. Elements already on screen, no-JS readers and
 * reduced-motion visitors see everything immediately.
 */
export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.reveal = "in";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    const fold = window.innerHeight * 0.94;
    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (el.getBoundingClientRect().top < fold) continue;
      el.dataset.reveal = "armed";
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}
