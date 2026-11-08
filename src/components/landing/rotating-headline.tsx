"use client";

import { useState } from "react";
import { useCycle, useReducedMotion } from "./hooks";

const BUILD = ["company", "product", "vision", "future"] as const;
const GROW = ["audience", "reputation", "brand", "voice", "authority", "presence", "story", "reach", "following", "legacy"] as const;
const GROW_MS = 2200;
const BUILD_MS = 4400;

/**
 * The value proposition, with the bracketed words cycling:
 * "You build the [company…]. We build your [audience…]."
 * Each changing word sits on an underline that fills like a timer until the
 * next word, so it reads as live. Hover pauses. Screen readers get one stable
 * sentence; reduced motion shows the first words, still underlined.
 */
export function RotatingHeadline({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const running = !reduced && !paused;
  const [g] = useCycle(GROW.length, GROW_MS, running);
  const [b] = useCycle(BUILD.length, BUILD_MS, running);
  return (
    <h1 className={className} style={style} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="sr-only">You build the company. We build your audience, reputation and brand.</span>
      <span aria-hidden className="block">
        You build the <Slot word={BUILD[b]!} ms={BUILD_MS} running={running} tone="fg" />.
      </span>
      <span aria-hidden className="block text-accent">
        We build your <Slot word={GROW[g]!} ms={GROW_MS} running={running} tone="accent" />.
      </span>
    </h1>
  );
}

function Slot({ word, ms, running, tone }: { word: string; ms: number; running: boolean; tone: "fg" | "accent" }) {
  return (
    <span className="rot-slot relative inline-block whitespace-nowrap" data-tone={tone}>
      <span key={word} className="rot-word inline-block">
        {word}
      </span>
      <span className="rot-track" aria-hidden>
        <span key={`${word}-bar`} className="rot-fill" style={{ animationDuration: `${ms}ms`, animationPlayState: running ? "running" : "paused" }} />
      </span>
    </span>
  );
}
