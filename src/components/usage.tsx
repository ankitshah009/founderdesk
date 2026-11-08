import type { Dispatch } from "@/lib/db/schema";

const LABEL: Record<string, string> = { naive: "Naïve agents", monid: "Monid research", mobilerun: "Mobile Run", local: "Built-in (no cost)" };
export const usd = (micro: number) => (micro === 0 ? "$0" : micro < 10_000 ? `$${(micro / 1_000_000).toFixed(4)}` : `$${(micro / 1_000_000).toFixed(2)}`);

/** Cost and run counts per provider, ClickUp/Fireflies-style breakdown. */
export function UsageBreakdown({ dispatches }: { dispatches: Pick<Dispatch, "provider" | "simulated" | "costMicroUsd" | "status">[] }) {
  const groups = new Map<string, { runs: number; cost: number }>();
  for (const d of dispatches) {
    if (d.status === "pending") continue;
    const key = d.simulated || !d.provider ? "local" : d.provider;
    const g = groups.get(key) ?? { runs: 0, cost: 0 };
    g.runs++;
    g.cost += d.costMicroUsd;
    groups.set(key, g);
  }
  const total = [...groups.values()].reduce((a, g) => a + g.cost, 0);
  const rows = [...groups.entries()].sort((a, b) => b[1].cost - a[1].cost);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Provider cost</p>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-fg tabular-nums">{usd(total)}</p>
      </div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {rows.map(([k, g]) => (
          <li key={k} className="flex items-center gap-3 py-2.5">
            <span className="flex-1 text-fg-2">{LABEL[k] ?? k}</span>
            <span className="w-20 text-right text-xs text-muted tabular-nums">{g.runs} run{g.runs === 1 ? "" : "s"}</span>
            <span className="w-24 text-right text-fg tabular-nums">{usd(g.cost)}</span>
            <span className="hidden w-24 sm:block">
              <span className="block h-1.5 rounded-full bg-white/8">
                <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${total ? Math.max(4, (g.cost / total) * 100) : 0}%` }} />
              </span>
            </span>
          </li>
        ))}
        {!rows.length ? <li className="py-2.5 text-muted">No work has run yet.</li> : null}
      </ul>
      <p className="mt-3 text-xs text-subtle">Naïve cost as reported per session; Monid as priced per call. Mobile Run bills in credits on its own dashboard.</p>
    </div>
  );
}
