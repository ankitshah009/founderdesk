import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Footer, Nav } from "@/components/chrome";
import { currentSession } from "@/lib/auth";
import { googleAvailable } from "@/lib/auth-google";
import { workosEnabled } from "@/lib/workos";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <>
      <Nav />
      <main className="glow-warm flex flex-1 items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.04em] text-fg">Sign in</h1>
          <p className="mt-3 mb-8 text-center text-sm text-muted">{workosEnabled() ? "Your orders and your Studio, in one account." : "Your orders and your Studio. No password: we email you a one-time link and code."}</p>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <Suspense fallback={null}>
              <Notice {...props} />
            </Suspense>
            <Suspense fallback={<SignInForm google={googleAvailable()} workos={workosEnabled()} />}>
              <FormWithNext {...props} />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-xs text-muted">
            New here?{" "}
            <a href="/signup" className="text-fg-2 underline underline-offset-2 hover:text-fg">
              Create your Studio
            </a>
          </p>
          <p className="mt-2 text-center text-xs text-subtle">Or email “login” to founderdesk@agentmail.to.</p>
        </div>
      </main>
      <Footer />
    </>
  );
}

async function Notice({ searchParams }: PageProps<"/signin">) {
  await connection();
  const next = (await searchParams).next;
  const session = await currentSession();
  if (session) {
    const { landingAfterSignIn } = await import("@/lib/studio/gate");
    redirect(await landingAfterSignIn(session.email, typeof next === "string" ? next : "/studio"));
  }
  const sp = await searchParams;
  if (sp.workos === "failed") return <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Sign-in didn&apos;t complete. Try again, or get a one-time code by email.</p>;
  if (sp.google === "failed") return <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Google sign-in didn&apos;t complete. Try again, or use your email below.</p>;
  if (sp.google === "unavailable") return <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">Google sign-in isn&apos;t set up on this deployment yet. Use your email below.</p>;
  return sp.expired ? <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">That link expired or was already used. Request a new one below.</p> : null;
}

async function FormWithNext({ searchParams }: PageProps<"/signin">) {
  const next = (await searchParams).next;
  const { safeNext } = await import("@/lib/auth-google");
  return <SignInForm google={googleAvailable()} workos={workosEnabled()} next={typeof next === "string" ? safeNext(next) : "/studio"} />;
}
