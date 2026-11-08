import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Footer, Nav } from "@/components/chrome";
import { MonoLabel } from "@/components/ui";
import { env } from "@/lib/env";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Start an article" };

export default function StartPage() {
  const inbox = env().AGENTMAIL_INBOX_ID;
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="frame grid gap-12 px-4 py-16 md:grid-cols-[1fr_320px] md:px-12 md:py-20">
          <div>
            <MonoLabel className="mb-5">Start an article</MonoLabel>
            <h1 className="h1 text-fg">Tell us what you want to argue</h1>
            <p className="lede mt-4 max-w-lg">Notes are enough. We turn them into a researched, sourced article and send it back for your approval before anything goes live.</p>
            <div className="panel mt-10 p-5 md:p-7">
              <StartForm />
            </div>
          </div>
          <aside className="space-y-4 md:pt-28">
            <div id="email" className="panel scroll-mt-20 p-5">
              <Mail className="size-4 text-[#8db4ff]" aria-hidden />
              <p className="mt-3 text-sm text-fg">Prefer email?</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {inbox ? (
                  <>
                    Send your notes, attachments and links to <span className="text-fg-2">{inbox}</span>. Same order, same thread.
                  </>
                ) : (
                  <>The email inbox isn&apos;t connected on this deployment yet — use the form for now.</>
                )}
              </p>
            </div>
            <div className="panel p-5 text-sm">
              <p className="text-fg">What happens next</p>
              <ol className="mt-3 space-y-2.5 text-muted">
                <li>1. You pay $9 — research starts immediately.</li>
                <li>2. If a number or claim needs you, we ask by email.</li>
                <li>3. You get a private page to approve or edit the exact text.</li>
                <li>4. We publish it, confirm it&apos;s live, and check it on a phone.</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
