import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, PageHead, SignedOut, Skeleton } from "@/components/studio/shared";
import { BEST_TIMES } from "@/lib/schedule";
import { studioSession } from "@/lib/studio/session";
import { upcomingFor } from "@/lib/workflow/scheduler";
import { QueueRow } from "./queue-row";

export const metadata: Metadata = { title: "Scheduler" };

export default function SchedulerPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Scheduler />
    </Suspense>
  );
}

const BEST: Array<[string, string]> = [
  ["LinkedIn", BEST_TIMES.linkedin.why],
  ["X", BEST_TIMES.x.why],
  ["Instagram", BEST_TIMES.instagram.why],
];

async function Scheduler() {
  await connection();
  const session = await studioSession();
  if (!session) return <SignedOut />;
  const items = await upcomingFor(session.email);
  return (
    <>
      <PageHead
        label="Scheduler"
        title="What goes out, and when"
        lede="Everything you've approved for later, across all your articles. Each item is checked against the exact version you approved before it goes out; a post never goes before its article."
      />
      <Card title={items.length ? `${items.length} scheduled` : "Nothing scheduled"}>
        {items.length ? (
          <ul className="-mx-4 mt-2 divide-y divide-line border-t border-line">
            {items.map((i) => (
              <QueueRow key={`${i.jobId}:${i.destination}`} jobId={i.jobId} destination={i.destination} title={i.title} at={i.at.toISOString()} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            When you approve an article you can schedule it and each post for its best time. Scheduled items show up here.{" "}
            <Link href="/start" className="text-fg underline underline-offset-4">
              Start an article
            </Link>
          </p>
        )}
      </Card>
      <div className="mt-6">
        <Card title="Suggested times">
          <ul className="mt-2 space-y-1.5 text-sm text-fg-2">
            {BEST.map(([k, v]) => (
              <li key={k}>
                <span className="font-medium text-fg">{k}:</span> {v}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-subtle">General engagement guidance in your timezone, used to pre-fill times at approval. Your own analytics will replace it once accounts are connected.</p>
        </Card>
      </div>
    </>
  );
}
