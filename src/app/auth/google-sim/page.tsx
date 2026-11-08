import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { googleSimulated, safeNext } from "@/lib/auth-google";
import { SimForm } from "./sim-form";

export const metadata: Metadata = { title: "Google sign-in (simulated)", robots: { index: false } };

/** Development-only stand-in for Google's account chooser, used when no Google OAuth app is configured. */
export default function GoogleSimPage(props: PageProps<"/auth/google-sim">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <Suspense fallback={null}>
        <Sim {...props} />
      </Suspense>
    </main>
  );
}

async function Sim({ searchParams }: PageProps<"/auth/google-sim">) {
  await connection();
  if (!googleSimulated()) notFound();
  const next = safeNext(String((await searchParams).next ?? ""));
  return (
    <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-6">
      <Wordmark />
      <p className="mt-6 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
        Simulated Google sign-in. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for the real Google account chooser. This page doesn&apos;t exist in production.
      </p>
      <SimForm next={next} />
    </div>
  );
}
