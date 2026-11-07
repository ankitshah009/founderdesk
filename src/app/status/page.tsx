import type { Metadata } from "next";
import { Footer, Nav } from "@/components/chrome";
import { Chip, MonoLabel } from "@/components/ui";
import { integrationStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Integration status" };

export default function StatusPage() {
  const items = integrationStatus();
  const live = items.filter((i) => i.live).length;
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="frame px-4 py-16 md:px-12">
          <MonoLabel>Status</MonoLabel>
          <h1 className="h1 mt-4 text-fg">Integrations</h1>
          <p className="lede mt-3">
            {live} of {items.length} connected on this deployment. Anything not connected runs as a labelled simulation — never as a silent fake.
          </p>
          <ul className="panel mt-10 divide-y divide-line">
            {items.map((i) => (
              <li key={i.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-fg">{i.label}</p>
                  <p className="mt-0.5 text-sm text-muted">{i.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-subtle sm:inline">{i.detail}</span>
                  <Chip tone={i.live ? "green" : "neutral"}>{i.live ? "Live" : "Simulated"}</Chip>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
