import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { Footer, Nav } from "@/components/chrome";
import { currentSession } from "@/lib/auth";
import { googleAvailable } from "@/lib/auth-google";
import { workosEnabled } from "@/lib/workos";
import { SignInForm } from "../signin/signin-form";

export const metadata: Metadata = { title: "Create your Studio", description: "Sign up for FounderDesk: your brand, voice and knowledge in one Studio, and your first article free." };

const PERKS = ["Your first article is free", "Brand captured from your website in a minute", "No password, no card to start"];

export default function SignUpPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="grid w-full max-w-4xl items-center gap-12 md:grid-cols-[1fr_380px]">
          <div>
            <p className="mono-label mb-5">Sign up</p>
            <h1 className="h1 text-fg">Create your Studio</h1>
            <p className="lede mt-4 max-w-md">One place for your brand, your voice and what you know. The desk uses all of it on every article, and nothing publishes until you approve it.</p>
            <ul className="mt-8 space-y-3 text-sm text-fg-2">
              {PERKS.map((p) => (
                <li key={p} className="flex items-center gap-2.5">
                  <Check className="size-4 text-green" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <Suspense fallback={null}>
              <SignedInRedirect />
            </Suspense>
            <SignInForm mode="signup" next="/studio/onboarding" google={googleAvailable()} workos={workosEnabled()} />
            <p className="mt-5 text-center text-xs text-muted">
              Already have an account?{" "}
              <Link href="/signin?next=/studio" className="text-fg-2 underline underline-offset-2 hover:text-fg">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

async function SignedInRedirect() {
  await connection();
  const session = await currentSession();
  if (session) {
    const { landingAfterSignIn } = await import("@/lib/studio/gate");
    redirect(await landingAfterSignIn(session.email, "/studio"));
  }
  return null;
}
