import { Check, Minus } from "lucide-react";
import { cn } from "../ui";
import { delay } from "./mock";

const PRODUCTS = ["FounderDesk", "Jasper", "Typeface", "AirOps"] as const;

type Row = { feature: string; detail?: string; has: [boolean, boolean, boolean, boolean] };

const SPECIFIC: Row[] = [
  { feature: "Every claim checked against a verbatim source passage", detail: "Before you are asked to approve", has: [true, false, false, false] },
  { feature: "Approval bound to the exact version's SHA-256 hash", detail: "A changed word voids it", has: [true, false, false, false] },
  { feature: "Published page fetched back and verified", detail: "Then opened on a real phone", has: [true, false, false, false] },
  { feature: "Asks you by email only when a number conflicts with a source", has: [true, false, false, false] },
  { feature: "Done for you per article", detail: "$9 each, first article free, no seat licence", has: [true, false, false, false] },
  { feature: "Idea Lab predictions from your own post history", detail: "Viral Twin Simulator", has: [true, false, false, false] },
];

const SHARED: Row[] = [
  { feature: "Brand voice", has: [true, true, true, true] },
  { feature: "Knowledge base", has: [true, true, true, true] },
  { feature: "Content for several channels", has: [true, true, true, true] },
  { feature: "Reusable workflows", has: [true, true, true, true] },
];

function Mark({ on, us, d }: { on: boolean; us: boolean; d: number }) {
  if (!on)
    return (
      <span className="inline-flex text-subtle">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">Not described on public product pages</span>
      </span>
    );
  return (
    <span className={cn("lv-pop inline-flex size-6 items-center justify-center rounded-full", us ? "bg-accent text-[#140a05]" : "bg-white/8 text-fg-2")} style={delay(d)}>
      <Check className="size-3.5" aria-hidden />
      <span className="sr-only">Yes</span>
    </span>
  );
}

function Rows({ rows, label, offset }: { rows: Row[]; label: string; offset: number }) {
  return (
    <>
      <tr>
        <th scope="colgroup" className="sticky left-0 z-10 bg-bg px-4 pt-6 pb-2 text-left font-mono text-[11px] font-normal text-muted md:px-5">
          {label}
        </th>
        <td aria-hidden className="border-x border-x-accent/30 bg-accent/[0.06]" />
        <td aria-hidden colSpan={3} />
      </tr>
      {rows.map((r, i) => (
        <tr key={r.feature} className="group">
          <th scope="row" className="sticky left-0 z-10 border-t border-line bg-bg px-4 py-3.5 text-left font-normal md:px-5">
            <span className="block text-[12.5px] leading-snug text-fg md:text-[13.5px]">{r.feature}</span>
            {r.detail ? <span className="block text-xs text-muted">{r.detail}</span> : null}
          </th>
          {r.has.map((h, k) => (
            <td key={k} className={cn("border-t border-line px-3 py-3.5 text-center", k === 0 && "border-x border-x-accent/30 bg-accent/[0.06]")}>
              <Mark on={h} us={k === 0} d={(offset + i) * 70} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Comparison() {
  return (
    <div data-reveal="">
      <p className="mb-3 text-xs text-muted md:hidden">Swipe sideways to compare →</p>
      <div className="lv-rail -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[580px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">FounderDesk compared with Jasper, Typeface and AirOps</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-[170px] bg-bg md:w-[44%] px-4 pb-3 text-left align-bottom font-mono text-[11px] font-normal text-muted md:px-5">
                Capability
              </th>
              {PRODUCTS.map((p, k) => (
                <th key={p} scope="col" className={cn("px-3 pt-4 pb-3 text-center align-bottom text-sm font-medium", k === 0 ? "rounded-t-lg border-x border-t-2 border-x-accent/30 border-t-accent bg-accent/[0.06] text-fg" : "text-fg-2")}>
                  {k === 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-full bg-accent" />
                      {p}
                    </span>
                  ) : (
                    p
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Rows rows={SPECIFIC} label="Specific to FounderDesk" offset={0} />
            <Rows rows={SHARED} label="Everyone has these" offset={SPECIFIC.length} />
            <tr aria-hidden>
              <td className="sticky left-0 bg-bg" />
              {PRODUCTS.map((p, k) => (
                <td key={p} className={cn("h-3", k === 0 && "rounded-b-lg border-x border-b border-x-accent/30 border-b-accent/30 bg-accent/[0.06]")} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-subtle">
        Based on each company&apos;s public product pages, November 2026. Products change; check their sites. A dash means we could not find it described, not that it can&apos;t be done.
      </p>
    </div>
  );
}
