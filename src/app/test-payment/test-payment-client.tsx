"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/components/ui";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors", done ? "bg-green/15 text-green" : "bg-white/6 text-fg-2 hover:bg-white/10")}
      aria-label={`Copy ${label}`}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * React refuses javascript: URLs in href, so the bookmarklet's href is set on
 * the DOM node after mount. Drag it to the bookmarks bar.
 */
export function Bookmarklet({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      draggable
      className="inline-flex cursor-grab items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[#140a05] shadow-[0_8px_24px_rgba(255,107,61,0.25)] active:cursor-grabbing"
      title="Drag me to your bookmarks bar"
    >
      Fill test card
    </a>
  );
}
