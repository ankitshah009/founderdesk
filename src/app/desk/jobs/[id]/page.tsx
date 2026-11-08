import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { UsageBreakdown } from "@/components/usage";
import { IN_PROGRESS, StageChip } from "@/components/stages";
import { Button, ButtonLink, Chip, MonoLabel, cn } from "@/components/ui";
import { deskRetry } from "@/app/actions";
import { deskAccess } from "@/lib/desk-auth";
import { links } from "@/lib/links";
import { signLink } from "@/lib/security";
import { deskJobView } from "@/lib/views";
import { ReplyForm } from "../../desk-forms";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default function DeskJobPage(props: PageProps<"/desk/jobs/[id]">) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
      <DeskJob {...props} />
    </Suspense>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="text-sm text-fg">{title}</p>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const statusTone = (s: string) => (s === "succeeded" || s === "fetched" || s === "published" || s === "sent" ? "green" : s === "failed" || s === "verify_failed" ? "red" : s === "started" || s === "publishing" ? "blue" : s === "empty" ? "amber" : "neutral");

async function DeskJob({ params }: PageProps<"/desk/jobs/[id]">) {
  await connection();
  const access = await deskAccess();
  if (access !== "ok") redirect("/desk/login");
  const { id } = await params;
  const v = await deskJobView(id);
  if (!v) notFound();
  const { job } = v;

  return (
    <div className="space-y-6 px-4 py-8 md:px-10 md:py-10">
      <div>
        <Link href="/desk" className="text-xs text-muted hover:text-fg">
          ← Orders
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-fg">{job.topic}</h1>
          <StageChip stage={job.stage} />
          <AutoRefresh tickUrl={`/api/orders/${job.id}/tick?t=${encodeURIComponent(signLink(job.id, "order"))}`} active={IN_PROGRESS.includes(job.stage)} />
        </div>
        {job.stageReason ? <p className="mt-2 text-sm text-muted">{job.stageReason}</p> : null}
        {job.stage === "UNABLE_TO_COMPLETE" ? (
          <form action={deskRetry} className="mt-3">
            <input type="hidden" name="jobId" value={job.id} />
            <Button type="submit">Retry this order</Button>
          </form>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={links.orderPath(job.id)} variant="secondary">
            Founder order page
          </ButtonLink>
          <ButtonLink href={links.reviewPath(job.id)} variant="secondary">
            Review page
          </ButtonLink>
          {v.web?.url ? <ButtonLink href={v.web.url}>Live article</ButtonLink> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Brief">
          <dl className="space-y-3 text-sm">
            {[
              ["Founder", `${job.founderName ?? ""} <${job.founderEmail}>`],
              ["Channel", job.channel],
              ["Thread", job.threadId ?? "—"],
              ["Thesis", job.thesis ?? "—"],
              ["Audience", job.audience ?? "—"],
              ["Boundaries", job.boundaries.join(" · ") || "—"],
              ["Private names", job.privateTerms.join(", ") || "—"],
              ["Links", job.sourceUrls.join(" ") || "—"],
              ["Payment", `${job.paymentStatus}${job.checkoutSessionId ? ` · ${job.checkoutSessionId}` : ""}`],
              ["Revision cycles", String(job.revisionCycles)],
            ].map(([k, val]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words text-fg-2">{val}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Founder thread">
          {job.openQuestions.length ? (
            <div className="mb-4 space-y-2">
              {job.openQuestions.map((q) => (
                <p key={q} className="rounded-lg border border-accent/25 bg-accent-tint px-3 py-2 text-sm text-fg">
                  {q}
                </p>
              ))}
            </div>
          ) : null}
          <ul className="mb-4 space-y-2 text-sm">
            {job.founderReplies.map((r, i) => (
              <li key={i} className="rounded-lg bg-panel-2 px-3 py-2 text-fg-2">
                <span className="mr-2 text-xs text-subtle">Reply {i + 1}</span>
                {r.text}
              </li>
            ))}
          </ul>
          <ReplyForm jobId={job.id} />
        </Section>
      </div>

      <Section title="Usage">
        <UsageBreakdown dispatches={v.dispatches} />
      </Section>

      <Section title="Dispatches" aside={<span className="text-xs text-muted">{v.dispatches.length} units of work</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 font-normal">Kind</th>
                <th className="pb-2 font-normal">Status</th>
                <th className="pb-2 font-normal">Provider</th>
                <th className="pb-2 font-normal">Request key</th>
                <th className="pb-2 font-normal">Attempts</th>
                <th className="pb-2 font-normal">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {v.dispatches.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 font-mono text-xs text-fg-2">{d.kind}</td>
                  <td className="py-2">
                    <Chip tone={statusTone(d.status)}>{d.status}</Chip>
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {d.simulated ? <Chip tone="amber">simulated</Chip> : (d.provider ?? "—")}
                    {d.providerRef ? <span className="ml-2 font-mono">{d.providerRef.slice(0, 14)}</span> : null}
                  </td>
                  <td className="max-w-[220px] truncate py-2 font-mono text-[11px] text-subtle">{d.requestKey.replace(job.id, "…")}</td>
                  <td className="py-2 text-xs text-muted">{d.attempts}</td>
                  <td className="max-w-[260px] truncate py-2 text-xs text-muted">{d.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Sources">
          <ul className="divide-y divide-line text-sm">
            {v.sources.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-8 font-mono text-xs text-accent-ink">{s.ref}</span>
                <span className="min-w-0 flex-1 truncate text-fg-2">{s.title ?? s.url ?? s.kind}</span>
                <span className="text-xs text-subtle">{s.kind}</span>
                <Chip tone={statusTone(s.status)}>{s.status}</Chip>
              </li>
            ))}
            {!v.sources.length ? <li className="py-2 text-muted">No sources yet.</li> : null}
          </ul>
        </Section>
        <Section title="Reviews">
          <ul className="space-y-4">
            {v.reviews.map((r) => {
              const d = v.drafts.find((x) => x.id === r.draftId);
              return (
                <li key={r.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={r.outcome === "READY_FOR_APPROVAL" ? "green" : r.outcome === "UNABLE_TO_COMPLETE" ? "red" : "amber"}>{r.outcome}</Chip>
                    <span className="text-xs text-muted">draft v{d?.version}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {r.findings.map((f) => (
                      <li key={f.id} className={cn("rounded-md px-2.5 py-1.5 text-xs", f.resolved ? "bg-green/5 text-muted" : f.severity === "blocking" ? "bg-red/5 text-fg-2" : "bg-white/[0.03] text-muted")}>
                        <span className="font-mono">{f.kind}</span> · {f.claim.slice(0, 140)}
                        {f.resolved ? " · resolved" : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {!v.reviews.length ? <li className="text-sm text-muted">No reviews yet.</li> : null}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Approvals & publications">
          <ul className="space-y-3 text-sm">
            {v.approvals.map((a) => (
              <li key={a.id} className="text-fg-2">
                Approved <span className="font-mono text-xs">{a.destination}</span> · sha256 <span className="font-mono text-xs">{a.contentHash.slice(0, 12)}</span> · {a.approvedBy} · {a.approvedAt.toLocaleString()}
              </li>
            ))}
            {v.publications.map((p) => (
              <li key={p.id} className="rounded-lg bg-panel-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{p.destination}</span>
                  <Chip tone={statusTone(p.status)}>{p.status}</Chip>
                  {p.url ? (
                    <a href={p.url} className="truncate text-xs text-muted underline">
                      {p.url}
                    </a>
                  ) : null}
                </div>
                {p.verification ? <p className="mt-1.5 text-xs text-muted">Verification: {p.verification.detail}</p> : null}
                {p.mobileCheck ? (
                  <p className="mt-1 text-xs text-muted">
                    Phone check ({p.mobileCheck.mode}): {p.mobileCheck.status}
                    {p.mobileCheck.layoutProblems?.length ? ` — ${p.mobileCheck.layoutProblems.join("; ")}` : ""}
                    {p.mobileCheck.recordingId ? ` · recording ${p.mobileCheck.recordingId}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
            {!v.approvals.length && !v.publications.length ? <li className="text-muted">Nothing approved yet.</li> : null}
          </ul>
        </Section>
        <Section title="Outbox & provider events">
          <ul className="divide-y divide-line text-sm">
            {v.outbox.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-fg-2">{m.kind.replace(/_/g, " ")}</span>
                <Chip tone={statusTone(m.state)}>{m.state}</Chip>
              </li>
            ))}
          </ul>
          <MonoLabel className="mt-5 mb-2">Events</MonoLabel>
          <ul className="space-y-1 text-xs text-muted">
            {v.events.map((e) => (
              <li key={e.id}>
                {e.provider} · {e.type} · {e.status}
                {e.note ? ` · ${e.note}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
