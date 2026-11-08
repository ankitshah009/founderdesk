import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Footer, Nav } from "@/components/chrome";
import { currentSession } from "@/lib/auth";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <>
      <Nav />
      <main className="glow-warm flex flex-1 items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.04em] text-fg">Your orders</h1>
          <p className="mt-3 mb-8 text-center text-sm text-muted">No password. We email you a one-time link and code.</p>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <Suspense fallback={null}>
              <Notice {...props} />
            </Suspense>
            <SignInForm />
          </div>
          <p className="mt-6 text-center text-xs text-subtle">Or email “login” to founderdesk@agentmail.to.</p>
        </div>
      </main>
      <Footer />
    </>
  );
}

async function Notice({ searchParams }: PageProps<"/signin">) {
  await connection();
  if (await currentSession()) redirect("/account");
  const expired = (await searchParams).expired;
  return expired ? <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-sm text-amber">That link expired or was already used. Request a new one below.</p> : null;
}
