"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export const STUDIO_LINKS: Array<{ href: string; label: string; group: "Workspace" | "Desk" }> = [
  { href: "/studio", label: "Overview", group: "Workspace" },
  { href: "/studio/onboarding", label: "Onboarding", group: "Workspace" },
  { href: "/studio/brand", label: "Brand & voice", group: "Workspace" },
  { href: "/studio/knowledge", label: "Knowledge", group: "Workspace" },
  { href: "/studio/agents", label: "Agents", group: "Desk" },
  { href: "/studio/calendar", label: "Calendar", group: "Desk" },
  { href: "/studio/ideas", label: "Idea Lab", group: "Desk" },
  { href: "/studio/insights", label: "Insights", group: "Desk" },
  { href: "/studio/connections", label: "Connections", group: "Desk" },
];

const isActive = (path: string | null, href: string) => (href === "/studio" ? path === "/studio" : !!path && (path === href || path.startsWith(`${href}/`)));

export function StudioNavLinks({ path }: { path: string | null }) {
  return (
    <nav aria-label="Studio" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col md:gap-0.5">
        {STUDIO_LINKS.map((l, i) => {
          const active = isActive(path, l.href);
          const groupStart = i === 0 || STUDIO_LINKS[i - 1]!.group !== l.group;
          return (
            <li key={l.href} className={cn(groupStart && i > 0 && "md:mt-5")}>
              {groupStart ? <p className="mono-label mb-2 hidden md:block">{l.group}</p> : null}
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-white/[0.06] text-fg" : "text-muted hover:bg-white/[0.03] hover:text-fg",
                )}
              >
                {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-accent md:block" /> : null}
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StudioNav() {
  return <StudioNavLinks path={usePathname()} />;
}
