import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { StudioNav, StudioNavLinks } from "@/components/studio/nav";
import { studioSession } from "@/lib/studio/session";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio" }, robots: { index: false } };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:px-6">
        <aside className="sticky top-14 z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-10">
          <div className="md:sticky md:top-24">
            <Suspense fallback={<StudioNavLinks path={null} />}>
              <StudioNav />
            </Suspense>
            <Suspense fallback={null}>
              <SidebarAccount />
            </Suspense>
          </div>
        </aside>
        <main className="min-w-0 py-8 md:py-10">{children}</main>
      </div>
    </>
  );
}

async function SidebarAccount() {
  await connection();
  const session = await studioSession();
  if (!session) return null;
  return (
    <div className="mt-8 hidden border-t border-line pt-4 md:block">
      <p className="truncate px-3 text-xs text-subtle" title={session.email}>
        {session.email}
      </p>
      <form action={signOutAction} className="mt-1">
        <button type="submit" className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/[0.03] hover:text-fg">
          <LogOut className="size-3.5" aria-hidden /> Log out
        </button>
      </form>
    </div>
  );
}
