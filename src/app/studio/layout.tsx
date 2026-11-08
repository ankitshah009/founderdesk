import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { StudioNav, StudioNavLinks } from "@/components/studio/nav";

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
          </div>
        </aside>
        <main className="min-w-0 py-8 md:py-10">{children}</main>
      </div>
    </>
  );
}
