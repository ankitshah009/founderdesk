import { env } from "@/lib/env";
import { requestJson } from "./http";

/**
 * Naïve Managed Agents. Three agent configurations (researcher, writer,
 * reviewer) are dispatched in order by the application. Every session is
 * created with an explicit idempotency key (the dispatch's stable request key)
 * and a JSON Schema for its structured result, which the application validates
 * before moving the job forward. An idle session is never treated as success
 * on its own: we require stop_reason "end_turn" and a schema-valid result.
 */

function base() {
  const e = env();
  if (!e.NAIVE_API_KEY) throw new Error("NAIVE_API_KEY is not set");
  return { url: e.NAIVE_BASE_URL.replace(/\/$/, ""), token: e.NAIVE_API_KEY };
}

export type NaiveSession = {
  id: string;
  status: "queued" | "running" | "idle" | "completed" | "failed" | "cancelled";
  stop_reason: string | null;
  stop_code: string | null;
  structured_output: unknown;
  consumed_micro_usd?: number;
};

export async function createAgent(args: { name: string; system: string; idempotencyKey: string }) {
  const { url, token } = base();
  const e = env();
  const { data } = await requestJson<{ id: string }>("naive", `${url}/agents`, {
    token,
    headers: { "idempotency-key": args.idempotencyKey },
    body: {
      name: args.name,
      model: e.NAIVE_MODEL,
      window: "immediate",
      system: args.system,
      // Agents in this pipeline reason over evidence the app supplies; they do
      // not need to browse, run shells or spend on their own.
      tools: { default_config: { permission: "deny" }, configs: {} },
      budget: {
        cap_micro_usd: e.NAIVE_SESSION_BUDGET_MICRO_USD * 200,
        max_task_micro_usd: e.NAIVE_SESSION_BUDGET_MICRO_USD,
        period: "month",
      },
      metadata: { app: "founderdesk" },
    },
  });
  return data;
}

export async function createSession(args: {
  agentId: string;
  message: string;
  outputSchema: Record<string, unknown>;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<NaiveSession> {
  const { url, token } = base();
  const { data } = await requestJson<NaiveSession>("naive", `${url}/sessions`, {
    token,
    headers: { "idempotency-key": args.idempotencyKey },
    body: {
      agent_id: args.agentId,
      message: args.message,
      window: "immediate",
      budget_micro_usd: env().NAIVE_SESSION_BUDGET_MICRO_USD,
      output_schema: args.outputSchema,
      structured_output_required: true,
      metadata: args.metadata,
    },
  });
  return data;
}

export async function getSession(id: string): Promise<NaiveSession> {
  const { url, token } = base();
  const { data } = await requestJson<NaiveSession>("naive", `${url}/sessions/${encodeURIComponent(id)}`, { token });
  return data;
}

export type SessionVerdict =
  | { state: "running" }
  | { state: "done"; output: unknown }
  | { state: "failed"; reason: string };

export function judgeSession(s: NaiveSession): SessionVerdict {
  if (s.status === "queued" || s.status === "running") return { state: "running" };
  if (s.status === "failed" || s.status === "cancelled") return { state: "failed", reason: `${s.status}${s.stop_code ? ` (${s.stop_code})` : ""}` };
  if (s.stop_reason !== "end_turn") return { state: "failed", reason: `stopped: ${s.stop_reason ?? "unknown"}${s.stop_code ? ` (${s.stop_code})` : ""}` };
  if (s.structured_output == null) return { state: "failed", reason: "session ended without a structured result" };
  return { state: "done", output: s.structured_output };
}
