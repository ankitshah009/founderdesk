import { desc, gt } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { deskRun } from "@/app/actions";
import { StageChip } from "@/components/stages";
import { UsageBreakdown } from "@/components/usage";
import { Button, Chip, MonoLabel } from "@/components/ui";
import { nowMs } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { dispatches, jobs } from "@/lib/db/schema";
import { deskAccess } from "@/lib/desk-auth";
import { env, integrationStatus } from "@/lib/env";
import { SimulateInboundForm } from "./desk-forms";

export const metadata: Metadata = { title: "Desk", robots: { index: false } };

export default function DeskPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
      <Desk />
    </Suspense>
  );
}

async function Desk() {
  await connection();
  const access = await deskAccess();
  if (access === "login") redirect("/desk/login");
  if (access === "unconfigured") return <p className="p-8 text-sm text-muted">Set DESK_TOKEN to enable the operator desk in production.</p>;
  const db = await getDb();
  const rows = await db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(100);
  const work = await db
    .select({ provider: dispatches.provider, simulated: dispatches.simulated, costMicroUsd: dispatches.costMicroUsd, status: dispatches.status })
    .from(dispatches)
    .where(gt(dispatches.createdAt, new Date(nowMs() - 30 * 86400_000)));
  const integrations = integrationStatus();
  return (
    <div className="px-4 py-8 md:px-10 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <MonoLabel>Operator desk</MonoLabel>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-fg">Orders</h1>
        </div>
        <form action={deskRun}>
          <Button variant="secondary" type="submit">
            Run workflow now
          </Button>
        </form>
      </div>

      <div className="panel mt-8 overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-normal">Order</th>
                  <th className="px-4 py-3 font-normal">Topic</th>
                  <th className="px-4 py-3 font-normal">Founder</th>
                  <th className="px-4 py-3 font-normal">Stage</th>
                  <th className="px-4 py-3 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((j) => (
                  <tr key={j.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/desk/jobs/${j.id}`} className="text-fg-2 hover:text-fg">
                        {j.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-fg-2">
                      <Link href={`/desk/jobs/${j.id}`}>{j.topic}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{j.founderEmail}</td>
                    <td className="px-4 py-3">
                      <StageChip stage={j.stage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{j.updatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">No orders yet. Deliver a test email below, or submit the form at /start.</p>
        )}
      </div>

      <div className="mt-10 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section id="simulate" className="panel scroll-mt-6 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-fg">Simulate an inbound email</p>
              <p className="mt-1 text-xs text-muted">Runs through the same processing path as a verified AgentMail webhook. Use a thread ID from an order to send a reply.</p>
            </div>
            <Chip tone="amber">Simulator</Chip>
          </div>
          <SimulateInboundForm inbox={env().AGENTMAIL_INBOX_ID ?? "desk@founderdesk.simulated"} />
        </section>
        <section className="panel p-5 md:p-6 xl:col-span-2">
          <p className="mb-4 text-sm text-fg">Usage · last 30 days</p>
          <UsageBreakdown dispatches={work} />
        </section>
        <section className="panel p-5 md:p-6">
          <p className="text-sm text-fg">Integrations</p>
          <ul className="mt-4 divide-y divide-line">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-fg-2">{i.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
                </div>
                <Chip tone={i.live ? "green" : "neutral"}>{i.live ? "Live" : "Simulated"}</Chip>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
