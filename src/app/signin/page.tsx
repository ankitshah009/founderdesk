import type { Metadata } from "next";
import { Footer, Nav } from "@/components/chrome";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <>
      <Nav />
      <main className="glow-warm flex flex-1 items-center justify-center px-4 py-24">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.04em] text-fg">Your orders</h1>
          <p className="mt-3 mb-8 text-center text-sm text-muted">No password. We email you a link that signs you in for 7 days.</p>
          <div className="rounded-3xl border border-line bg-panel p-6">
            <SignInForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
