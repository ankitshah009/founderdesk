import { and, asc, eq, inArray, lte, sql, isNull, or, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dispatches, type Dispatch, type DispatchKind } from "@/lib/db/schema";
import { ProviderError } from "@/lib/integrations/http";

/**
 * The dispatcher. Work is a row in `dispatches`; a worker leases one row at a
 * time (FOR UPDATE SKIP LOCKED), so any number of concurrent ticks — webhook
 * after() callbacks, cron, page polls — are safe. Each kind of work has a
 * handler with up to three phases:
 *
 *   start(d)    → { done: output } for synchronous work
 *               → { started: providerRef } for remote async work (Naïve session,
 *                 Monid async run, Mobile Run task); the ref is persisted before
 *                 anything else happens so a crash never orphans remote work
 *   poll(d)     → { running } | { done } | { failed } for started work
 *   complete(d) → apply the validated result: write domain records, move the
 *                 job's stage, enqueue the next dispatches
 */

export type StartResult =
  | { done: unknown; simulated?: boolean; costMicroUsd?: number }
  | { started: string; provider: string; simulated?: boolean }
  | { defer: number; reason: string };
export type PollResult = { running: true } | { done: unknown; costMicroUsd?: number } | { failed: string; retryable?: boolean; costMicroUsd?: number };

export type Handler = {
  start(d: Dispatch): Promise<StartResult>;
  poll?(d: Dispatch): Promise<PollResult>;
  complete(d: Dispatch, output: unknown): Promise<void>;
  /** Called once retries are exhausted or the failure is permanent. */
  fail(d: Dispatch, reason: string): Promise<void>;
  pollEveryMs?: number;
};

const LEASE_MS = 90_000;
const handlers = new Map<DispatchKind, Handler>();

export function registerHandler(kind: DispatchKind, h: Handler) {
  handlers.set(kind, h);
}

async function claimNext(): Promise<Dispatch | null> {
  const db = await getDb();
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const candidates = db
    .select({ id: dispatches.id })
    .from(dispatches)
    .where(
      and(
        inArray(dispatches.status, ["pending", "started"]),
        lte(dispatches.nextRunAt, now),
        or(isNull(dispatches.leaseUntil), lt(dispatches.leaseUntil, now)),
      ),
    )
    .orderBy(asc(dispatches.nextRunAt), asc(dispatches.createdAt))
    .limit(1)
    .for("update", { skipLocked: true });
  const [row] = await db
    .update(dispatches)
    .set({ leaseUntil, updatedAt: now })
    .where(inArray(dispatches.id, candidates))
    .returning();
  return row ?? null;
}

async function save(id: string, patch: Partial<Dispatch>) {
  const db = await getDb();
  await db.update(dispatches).set({ ...patch, updatedAt: new Date() }).where(eq(dispatches.id, id));
}

function backoff(attempt: number): Date {
  return new Date(Date.now() + Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1)));
}

async function handleError(d: Dispatch, h: Handler, err: unknown) {
  const reason = err instanceof Error ? err.message : String(err);
  const retryable = err instanceof ProviderError ? err.retryable : !(err instanceof PermanentError);
  const attempts = d.attempts + 1;
  if (retryable && attempts < d.maxAttempts) {
    await save(d.id, { attempts, error: reason.slice(0, 1000), leaseUntil: null, nextRunAt: backoff(attempts) });
    return;
  }
  await save(d.id, { attempts, status: "failed", error: reason.slice(0, 1000), leaseUntil: null, finishedAt: new Date() });
  await h.fail({ ...d, attempts }, reason);
}

/**
 * Idempotency key for the remote call behind a dispatch. Stable across
 * transient retries (a lost response replays the same creation), and changes
 * only when a remote run has definitively failed and must be redone.
 */
export function idempotencyKey(d: Dispatch): string {
  const run = Number(d.input._run ?? 0);
  return run ? `${d.requestKey}#${run}` : d.requestKey;
}

export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

async function finish(d: Dispatch, h: Handler, output: unknown) {
  // Persist the raw result before applying it, so a failure while applying can
  // be retried from the stored output without re-running remote work.
  await save(d.id, { output: output as never });
  try {
    await h.complete({ ...d, output }, output);
    await save(d.id, { status: "succeeded", leaseUntil: null, error: null, finishedAt: new Date() });
  } catch (err) {
    await handleError({ ...d, output }, h, err);
  }
}

/** Process one runnable dispatch. Returns false when nothing was runnable. */
export async function step(): Promise<boolean> {
  const d = await claimNext();
  if (!d) return false;
  const h = handlers.get(d.kind);
  if (!h) {
    await save(d.id, { status: "failed", error: `No handler for ${d.kind}`, leaseUntil: null });
    return true;
  }
  try {
    if (d.status === "pending" && !d.startedAt) await save(d.id, { startedAt: new Date() });
    if (d.status === "pending") {
      // A stored output means the remote work already finished and only the
      // apply step failed last time: re-apply rather than re-run.
      if (d.output != null) return await finish(d, h, d.output).then(() => true);
      const res = await h.start(d);
      if ("defer" in res) {
        await save(d.id, { leaseUntil: null, error: res.reason, nextRunAt: new Date(Date.now() + res.defer) });
      } else if ("done" in res) {
        if (res.simulated || res.costMicroUsd) await save(d.id, { simulated: res.simulated ?? false, costMicroUsd: d.costMicroUsd + (res.costMicroUsd ?? 0) });
        await finish(d, h, res.done);
      } else {
        await save(d.id, {
          status: "started",
          provider: res.provider,
          providerRef: res.started,
          simulated: res.simulated ?? false,
          leaseUntil: null,
          nextRunAt: new Date(Date.now() + (h.pollEveryMs ?? 3_000)),
        });
      }
    } else if (d.status === "started") {
      if (!h.poll) throw new PermanentError(`${d.kind} was started but has no poll handler`);
      const res = await h.poll(d);
      if ("running" in res) {
        await save(d.id, { leaseUntil: null, nextRunAt: new Date(Date.now() + (h.pollEveryMs ?? 3_000)) });
      } else if ("done" in res) {
        if (res.costMicroUsd) await save(d.id, { costMicroUsd: d.costMicroUsd + res.costMicroUsd });
        await finish(d, h, res.done);
      } else {
        if (res.costMicroUsd) await save(d.id, { costMicroUsd: d.costMicroUsd + res.costMicroUsd });
        const err = res.retryable ? new Error(res.failed) : new PermanentError(res.failed);
        if (res.retryable) {
          // A failed remote run must be started again from scratch, under a new
          // idempotency key (otherwise the provider hands back the failed run).
          const input = { ...d.input, _run: Number(d.input._run ?? 0) + 1 };
          await save(d.id, { status: "pending", providerRef: null, input });
          await handleError({ ...d, status: "pending", input }, h, err);
        } else {
          await handleError(d, h, err);
        }
      }
    }
  } catch (err) {
    await handleError(d, h, err);
  }
  return true;
}

export async function nextWakeAt(): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db
    .select({ at: sql<Date | null>`min(${dispatches.nextRunAt})` })
    .from(dispatches)
    .where(inArray(dispatches.status, ["pending", "started"]));
  return row?.at ? new Date(row.at) : null;
}
