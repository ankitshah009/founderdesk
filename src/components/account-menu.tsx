"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions";

/** The signed-in account button in the site header: where you are signed in, and the way out. */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-2 hover:bg-white/[0.04] hover:text-fg"
      >
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-accent-tint text-xs font-semibold uppercase text-accent-ink">
          {email[0]}
        </span>
        <span className="max-w-[160px] truncate max-md:hidden">{email}</span>
        <ChevronDown className="size-3.5 text-subtle" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-line-strong bg-elev p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
          <p className="truncate px-3 pb-2 pt-1.5 text-xs text-muted">Signed in as {email}</p>
          <Link role="menuitem" href="/studio" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg">
            Studio
          </Link>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg">
            Your orders
          </Link>
          <form action={signOutAction} className="mt-1 border-t border-line pt-1">
            <button role="menuitem" type="submit" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg">
              <LogOut className="size-3.5" aria-hidden /> Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
