import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Mail } from "lucide-react";
import { Footer, Nav } from "@/components/chrome";
import { MonoLabel } from "@/components/ui";
import { env } from "@/lib/env";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Start an article" };

/** Signed-in founders who haven't finished onboarding go there first (and come straight back). */
async function OnboardingGate() {
  await connection();
  const { currentSession } = await import("@/lib/auth");
  const session = await currentSession();
  if (!session) return null;
  const { needsOnboarding, onboardingPath } = await import("@/lib/studio/gate");
  if (await needsOnboarding(session.email)) redirect(onboardingPath("/start"));
  return null;
}

export default function StartPage() {
  const inbox = env().AGENTMAIL_INBOX_ID;
  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGate />
      </Suspense>
      <Nav />
      <main className="flex-1">
        <div className="frame grid gap-12 px-4 py-16 md:grid-cols-[1fr_320px] md:px-12 md:py-20">
          <div>
            <MonoLabel className="mb-5">Start an article</MonoLabel>
            <h1 className="h1 text-fg">Drop in what you&apos;ve got.</h1>
            <p className="lede mt-4 max-w-lg">Your website, rough notes, a link, or a two-minute voice note. If you already know your argument we&apos;ll write it; if not, we&apos;ll suggest one only you can make. First article free.</p>
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
                <li>1. Confirm your email — your first article is free.</li>
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
