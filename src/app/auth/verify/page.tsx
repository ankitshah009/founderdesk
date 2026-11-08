import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { confirmSignInLink } from "@/app/actions";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Confirm sign-in", robots: { index: false, follow: false } };

/**
 * The emailed link lands here instead of signing in on GET: mail security
 * scanners open links automatically, and a GET that consumed the challenge
 * would sign the scanner in (or burn the link). A deliberate POST does not.
 */
export default function VerifyPage(props: PageProps<"/auth/verify">) {
  return (
    <main className="glow-warm flex min-h-dvh flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-8 text-center">
        <Wordmark />
        <Suspense fallback={null}>
          <Confirm {...props} />
        </Suspense>
      </div>
    </main>
  );
}

async function Confirm({ searchParams }: PageProps<"/auth/verify">) {
  await connection();
  const sp = await searchParams;
  const c = typeof sp.c === "string" ? sp.c : "";
  const t = typeof sp.t === "string" ? sp.t : "";
  return (
    <form action={confirmSignInLink} className="mt-8 space-y-4">
      <input type="hidden" name="c" value={c} />
      <input type="hidden" name="t" value={t} />
      <p className="text-fg">Sign in to FounderDesk on this device?</p>
      <Button type="submit" className="w-full py-3">
        Continue
      </Button>
    </form>
  );
}
