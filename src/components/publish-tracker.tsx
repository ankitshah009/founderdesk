import { ArrowUpRight, CheckCircle2, Clock, Loader2, Smartphone, XCircle } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import type { Approval, Dispatch, Job, Publication } from "@/lib/db/schema";

const LABEL: Record<string, string> = { web: "Article", x: "X", linkedin: "LinkedIn", instagram: "Instagram", wordpress: "WordPress", ghost: "Ghost", webflow: "Webflow" };

export type TrackRow = {
  destination: string;
  state: "live" | "posting" | "scheduled" | "waiting" | "failed";
  url?: string | null;
  at?: Date | null;
  viaPhone?: boolean;
  detail?: string | null;
};

/** Where each approved destination stands right now. Pure, so it is easy to test. */
export function trackRows(args: { job: Pick<Job, "destinations">; approvals: Approval[]; publications: Publication[]; dispatches: Dispatch[]; now: number }): TrackRow[] {
  const dests = [...new Set(["web", ...args.job.destinations, ...args.approvals.map((a) => a.destination)])];
  const webLive = args.publications.some((p) => p.destination === "web" && p.status === "published");
  return dests.map((destination) => {
    const pub = [...args.publications].reverse().find((p) => p.destination === destination);
    const d = [...args.dispatches].reverse().find((x) => x.kind === "publish" && String((x.input as { destination?: string }).destination) === destination);
    const approval = args.approvals.find((a) => a.destination === destination);
    const viaPhone = Boolean(d?.provider === "mobilerun" || pub?.externalId?.startsWith("mobilerun:"));
    if (pub?.status === "published") return { destination, state: "live", url: pub.url, viaPhone };
    if (pub && (pub.status === "failed" || pub.status === "verify_failed")) return { destination, state: "failed", detail: pub.verification?.detail ?? null };
    if (d?.status === "failed") return { destination, state: "failed", detail: d.error };
    if (d && (d.status === "started" || (d.status === "pending" && d.nextRunAt.getTime() <= args.now + 30_000))) return { destination, state: "posting", viaPhone };
    const at = d?.status === "pending" ? d.nextRunAt : (approval?.scheduledAt ?? null);
    if (at && at.getTime() > args.now + 30_000) return { destination, state: "scheduled", at };
    if (destination !== "web" && !webLive) return { destination, state: "waiting" };
    return { destination, state: "posting", viaPhone };
  });
}

/** True while anything still has to go out soon: keep the page refreshing. */
export function stillMoving(rows: TrackRow[], now: number): boolean {
  return rows.some((r) => r.state === "posting" || r.state === "waiting" || (r.state === "scheduled" && !!r.at && r.at.getTime() - now < 10 * 60_000));
}

const ICON = {
  live: <CheckCircle2 className="size-4 text-green" aria-hidden />,
  posting: <Loader2 className="size-4 animate-spin text-accent" aria-hidden />,
  scheduled: <Clock className="size-4 text-fg-2" aria-hidden />,
  waiting: <Clock className="size-4 text-subtle" aria-hidden />,
  failed: <XCircle className="size-4 text-red" aria-hidden />,
};

export function PublishTracker({ rows }: { rows: TrackRow[] }) {
  return (
    <section aria-labelledby="track-h" className="mt-8 max-w-xl">
      <h2 id="track-h" className="mb-3 text-sm font-semibold text-fg">
        Where it&apos;s going
      </h2>
      <ol className="divide-y divide-line rounded-2xl border border-line bg-panel">
        {rows.map((r) => (
          <li key={r.destination} className="flex items-start gap-3 px-4 py-3 text-sm">
            <span className="mt-0.5">{ICON[r.state]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{LABEL[r.destination] ?? r.destination}</p>
              <p className="mt-0.5 text-xs text-muted">
                {r.state === "live" ? (r.destination === "web" ? "Live and verified" : r.viaPhone ? "Posted from your phone" : "Posted") : null}
                {r.state === "posting" ? (
                  r.viaPhone ? (
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="size-3" aria-hidden /> Posting from your phone now
                    </span>
                  ) : r.destination === "web" ? (
                    "Publishing and checking the live page"
                  ) : (
                    "Posting now"
                  )
                ) : null}
                {r.state === "scheduled" && r.at ? (
                  <>
                    Scheduled for <LocalTime iso={r.at.toISOString()} withDate />
                  </>
                ) : null}
                {r.state === "waiting" ? "Goes out once the article is live" : null}
                {r.state === "failed" ? `Didn't go out${r.detail ? `: ${r.detail.slice(0, 140)}` : ""}` : null}
              </p>
            </div>
            {r.state === "live" && r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-fg-2 underline underline-offset-2 hover:text-fg">
                Open <ArrowUpRight className="size-3" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
