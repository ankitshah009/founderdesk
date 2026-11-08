"use client";

import { useRef, useState } from "react";
import { Check, CornerDownLeft } from "lucide-react";
import { Chip, cn } from "../ui";
import { useCycle, useInView, useReducedMotion } from "./hooks";
import { delay } from "./mock";

/* Small live demos for the Studio bento. Each runs only while on screen. */

const ASK_TIMES = [1300, 1300, 2100, 1700, 2600] as const;
const ASK = "Shorter. Say teams, not customers.";

export function HighlightAskDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [i] = useCycle(ASK_TIMES.length, ASK_TIMES, inView && !reduced);
  const phase = reduced ? 4 : i;
  const fade = (on: boolean) => cn("transition-[opacity,translate] duration-500", on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1");

  return (
    <div ref={ref} aria-hidden className="flex h-full flex-col">
      <p className="text-[13px] leading-relaxed text-fg-2">
        Most founders try to automate every ticket at once.{" "}
        {phase >= 3 ? (
          <span key="new" className="lv-fade rounded bg-green/12 px-1 text-green">
            Teams that started with resets and refunds cut median first-response time by 60%.
          </span>
        ) : (
          <span className={cn("text-fg", phase >= 1 && "lv-mark")}>
            In the pilot, the customers who started with password resets and refunds saw median first-response time improve by 60%.
          </span>
        )}
      </p>
      <div className={cn("mt-3 flex items-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-3 py-2", fade(phase >= 2))}>
        <span className="flex min-w-0 flex-1 items-center overflow-hidden font-mono text-[12px] text-fg">
          {phase === 2 ? (
            <span className="lv-type" style={delay(150, { "--n": ASK.length, "--t": "1.3s" })}>
              {ASK}
            </span>
          ) : (
            <span className="whitespace-nowrap">{ASK}</span>
          )}
          <span className={cn("ml-px inline-block h-3.5 w-px shrink-0 bg-accent", phase === 2 && "lv-caret")} />
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-[#140a05]">
          <CornerDownLeft className="size-3.5" />
        </span>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        <span className={fade(phase >= 3)}>
          <Chip tone="blue">v4 · back through fact-check</Chip>
        </span>
        <span className={fade(phase >= 4)}>
          <Chip tone="green">
            <Check className="size-3" /> Passed, ready to approve
          </Chip>
        </span>
      </div>
    </div>
  );
}

const PERSONAS = [
  { key: "Investors", line: "Across 42 B2B SaaS pilot companies, narrow workflows improved median first-response time by 60%. That is the wedge we expand from." },
  { key: "Customers", line: "Start with password resets and refunds. In our pilot, replies to those tickets came 60% faster." },
  { key: "Developers", line: "Route two ticket types to a narrow workflow first, then measure median first-response time before and after." },
] as const;

export function PersonaDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState(false);
  const [i, setI] = useCycle(PERSONAS.length, 3400, inView && !reduced && !picked);
  const p = PERSONAS[i];
  return (
    <div ref={ref} className="flex h-full flex-col">
      <div role="group" aria-label="Audience" className="grid grid-cols-3 rounded-lg border border-line bg-panel-2 p-0.5 text-[12px]">
        {PERSONAS.map((x, k) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={k === i}
            onClick={() => {
              setPicked(true);
              setI(k);
            }}
            className={cn("rounded-md py-1 transition-colors", k === i ? "bg-white/10 text-fg" : "text-muted hover:text-fg-2")}
          >
            {x.key}
          </button>
        ))}
      </div>
      <p className="mono-label mt-4 text-[11px]">Same idea, for {p.key.toLowerCase()}</p>
      <div className="lv-stack mt-1.5">
        {PERSONAS.map((x, k) => (
          <p
            key={x.key}
            aria-hidden={k !== i}
            className={cn("text-[13.5px] leading-relaxed text-fg transition-[opacity,translate] duration-500", k === i ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-1.5")}
          >
            {x.line}
          </p>
        ))}
      </div>
    </div>
  );
}
