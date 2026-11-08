import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "./brand";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOutAction } from "@/app/actions";
import { ButtonLink } from "./ui";

function SignedOutLinks() {
  return (
    <>
      <Link href="/signin?next=/studio" className="whitespace-nowrap px-2 text-sm text-fg-2 hover:text-fg">Sign in</Link>
      <ButtonLink href="/signup" variant="secondary" className="max-sm:hidden">Sign up</ButtonLink>
    </>
  );
}

/** The header reflects the session: signed-in founders see their Studio, not "Sign in". */
async function AccountLinks() {
  await connection();
  const { currentSession } = await import("@/lib/auth");
  const session = await currentSession();
  if (!session) return <SignedOutLinks />;
  return (
    <>
      <Link href="/account" className="whitespace-nowrap px-2 text-sm text-fg-2 hover:text-fg max-sm:hidden">Your orders</Link>
      <ButtonLink href="/studio" variant="secondary" className="max-sm:hidden" title={session.email}>Studio</ButtonLink>
      <form action={signOutAction}>
        <button type="submit" aria-label="Sign out" className="whitespace-nowrap px-2 text-sm text-fg-2 hover:text-fg" title={`Signed in as ${session.email}`}>
          Sign out
        </button>
      </form>
    </>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1072px] items-center justify-between px-4 md:px-6">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-muted lg:flex">
          <Link href="/#how" className="hover:text-fg">How it works</Link>
          <Link href="/#features" className="hover:text-fg">Features</Link>
          <Link href="/#idea-lab" className="hover:text-fg">Idea Lab</Link>
          <Link href="/#compare" className="hover:text-fg">Compare</Link>
          <Link href="/#pricing" className="hover:text-fg">Pricing</Link>
          <Link href="/studio" className="hover:text-fg">Studio</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={<SignedOutLinks />}>
            <AccountLinks />
          </Suspense>
          <ButtonLink href="/start">Start an article</ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function Announcement() {
  return (
    <div className="border-b border-line">
      <Link href="/start" className="group mx-auto flex max-w-[1072px] items-center justify-center gap-2.5 px-4 py-2.5 text-sm text-fg-2">
        <span className="shrink-0 whitespace-nowrap rounded-md bg-accent-tint px-2 py-0.5 text-accent-ink">First article</span>
        <span className="truncate">First article free. First 100 founders: code FIRST100 for another one on us</span>
        <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

const columns = [
  { title: "Product", links: [["How it works", "/#how"], ["Features", "/#features"], ["Idea Lab", "/#idea-lab"], ["Evidence", "/#evidence"], ["Compare", "/#compare"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"], ["Articles", "/articles"]] },
  { title: "Builders", links: [["Infrastructure", "/#stack"], ["MCP server", "/desk/connect"], ["Integration status", "/status"]] },
  { title: "Founders", links: [["Start an article", "/start"], ["Sign up", "/signup"], ["Sign in", "/signin?next=/studio"], ["Studio", "/studio"], ["Desk", "/desk"], ["Email intake", "/start#email"]] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1072px] gap-10 px-4 py-14 md:grid-cols-[1.2fr_repeat(3,1fr)] md:px-6">
        <div className="flex flex-col justify-between gap-8">
          <Wordmark />
          <Link href="/status" className="inline-flex items-center gap-2 text-xs text-green">
            <span className="size-1.5 rounded-full bg-green" aria-hidden />
            Integration status
          </Link>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="mb-4 text-sm text-fg">{c.title}</p>
            <ul className="space-y-2.5 text-sm text-muted">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-fg">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1072px] justify-between px-4 pb-8 text-xs text-subtle md:px-6">
        <span>© 2026 FounderDesk</span>
        <span>Nothing publishes without your approval.</span>
      </div>
    </footer>
  );
}
