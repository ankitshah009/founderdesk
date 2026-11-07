"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Mark } from "@/components/brand";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Mark size={28} className="text-fg" />
      <h1 className="mt-6 text-2xl font-medium tracking-[-0.02em] text-fg">Something went wrong on our side</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        Your order and anything you sent us are safe. Try again in a moment{error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <div className="mt-8 flex gap-2.5">
        <button onClick={reset} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#222] hover:bg-[#e8e8e8]">
          Try again
        </button>
        <Link href="/" className="rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-sm font-medium text-fg hover:bg-[#333]">
          Home
        </Link>
      </div>
    </main>
  );
}
