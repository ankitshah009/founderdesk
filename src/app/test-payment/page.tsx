import type { Metadata } from "next";
import { Download, MousePointerClick, Puzzle, ShieldCheck } from "lucide-react";
import { Footer, Nav } from "@/components/chrome";
import { Chip, MonoLabel } from "@/components/ui";
import { TEST_CARD_ROWS, bookmarkletHref } from "@/lib/test-payment";
import { Bookmarklet, CopyButton } from "./test-payment-client";

export const metadata: Metadata = {
  title: "Test payments",
  description: "Pay in Stripe test mode without typing: Stripe's test card, a one-click autofill extension and a bookmarklet.",
};

export default function TestPaymentPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="frame px-4 py-16 md:px-12 md:py-20">
          <div className="max-w-2xl">
            <MonoLabel className="mb-5">Test payments</MonoLabel>
            <h1 className="h1 text-fg">Skip typing the test card</h1>
            <p className="lede mt-4">
              While Stripe is in test mode, Checkout takes Stripe&apos;s test card and charges nothing. Install the autofill extension and the card fills itself, or use the bookmarklet or the copy buttons below.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <section className="panel p-6">
              <div className="flex items-center gap-2">
                <Puzzle className="size-4 text-accent-ink" aria-hidden />
                <p className="text-sm text-fg">Autofill extension</p>
                <Chip tone="green">Recommended</Chip>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">Fills the card as soon as a test Checkout page opens. A button (or Alt+Shift+F) fills it again.</p>
              <a href="/test-payment/extension.zip" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#222] hover:bg-[#e8e8e8]">
                <Download className="size-3.5" aria-hidden /> Download extension
              </a>
              <ol className="mt-5 space-y-2 text-sm text-fg-2">
                <li>1. Unzip it.</li>
                <li>
                  2. Open <span className="font-mono text-xs text-accent-ink">chrome://extensions</span> and turn on Developer mode.
                </li>
                <li>3. Click Load unpacked and choose the unzipped folder.</li>
              </ol>
              <p className="mt-4 text-xs text-subtle">Works in Chrome, Edge, Arc and Brave.</p>
            </section>

            <section className="panel p-6">
              <div className="flex items-center gap-2">
                <MousePointerClick className="size-4 text-[#8db4ff]" aria-hidden />
                <p className="text-sm text-fg">Bookmarklet</p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">No install. Drag the button to your bookmarks bar, then click the bookmark on the Stripe Checkout page.</p>
              <div className="mt-5">
                <Bookmarklet href={bookmarkletHref()} />
              </div>
              <p className="mt-5 text-xs text-subtle">Can&apos;t see your bookmarks bar? Press ⌘⇧B (Mac) or Ctrl+Shift+B.</p>
            </section>
          </div>

          <section className="panel mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="text-sm text-fg">Or enter it by hand</p>
              <span className="text-xs text-muted">Stripe test mode only</span>
            </div>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Field</th>
                  <th>Enter</th>
                  <th>Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {TEST_CARD_ROWS.map((r) => (
                  <tr key={r.field}>
                    <td className="w-40 px-5 py-3 text-muted">{r.field}</td>
                    <td className="px-2 py-3 font-mono text-[13px] text-fg-2">{r.value}</td>
                    <td className="px-5 py-3 text-right">
                      <CopyButton value={r.copy} label={r.field} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-green" aria-hidden />
            The extension and bookmarklet only run when the Checkout URL contains a test-mode session (cs_test_). They never run on live payment pages, and the test card is declined in live mode anyway.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
