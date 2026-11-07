import Link from "next/link";
import { Activity, ChevronsUpDown, Inbox, Plug, Plus } from "lucide-react";
import { Mark } from "@/components/brand";

export default function DeskLayout({ children }: LayoutProps<"/desk">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-[#070707] md:sticky md:top-0 md:h-dvh md:w-[232px] md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 p-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg hover:bg-white/5">
            <span className="flex size-5 items-center justify-center rounded bg-white text-black">
              <Mark size={14} className="text-black" />
            </span>
            <span className="truncate">FounderDesk</span>
            <ChevronsUpDown className="size-3.5 text-subtle" aria-hidden />
          </Link>
        </div>
        <div className="mx-3 mb-3 grid grid-cols-2 rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
          <span className="rounded-md bg-white/8 py-1 text-center text-fg">Operator</span>
          <Link href="/" className="py-1 text-center text-muted hover:text-fg">
            Site
          </Link>
        </div>
        <nav aria-label="Desk" className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm md:flex-col md:overflow-visible">
          {[
            ["/desk", Inbox, "Orders"],
            ["/desk#simulate", Plus, "Simulate email"],
            ["/desk/connect", Plug, "MCP & integrations"],
            ["/status", Activity, "Status"],
          ].map(([href, Icon, label]) => {
            const I = Icon as typeof Inbox;
            return (
              <Link key={href as string} href={href as string} className="flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-fg-2 hover:bg-white/5 hover:text-fg">
                <I className="size-4 text-muted" aria-hidden />
                {label as string}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
