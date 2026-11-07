import { env } from "@/lib/env";
import { requestJson } from "./http";

/**
 * Mobile Run (Droidrun Cloud): POST /tasks dispatches an agent on a real
 * Android device; GET /tasks/{id}/status reports the outcome. There is no
 * webhook, so the dispatcher polls. Task acceptance alone never counts as a
 * check: we require a terminal status, `succeeded`, and structured output.
 */

function base() {
  const e = env();
  if (!e.MOBILERUN_API_KEY) throw new Error("MOBILERUN_API_KEY is not set");
  if (!e.MOBILERUN_DEVICE_ID) throw new Error("MOBILERUN_DEVICE_ID is not set");
  return { url: e.MOBILERUN_BASE_URL.replace(/\/$/, ""), token: e.MOBILERUN_API_KEY, deviceId: e.MOBILERUN_DEVICE_ID };
}

export const MOBILE_CHECK_SCHEMA = {
  type: "object",
  properties: {
    pageLoaded: { type: "boolean" },
    headlineVisible: { type: "boolean", description: "The expected headline text is visible on screen" },
    scrolledToEnd: { type: "boolean", description: "You scrolled through the whole article" },
    sourceLinksPresent: { type: "boolean", description: "The Sources section lists at least one link" },
    layoutProblems: {
      type: "array",
      items: { type: "string" },
      description: "Concrete problems: horizontal scrolling, clipped or overlapping text, unreadably small text, broken images",
    },
  },
  required: ["pageLoaded", "headlineVisible", "scrolledToEnd", "sourceLinksPresent", "layoutProblems"],
} as const;

export function mobileCheckTask(url: string, headline: string): string {
  return [
    `Open Chrome and go to ${url}`,
    `Confirm the article headline "${headline}" is visible near the top of the page.`,
    "Scroll slowly through the entire article to the end, including the Sources section.",
    "Check that the Sources section contains at least one link.",
    "Note any layout problems: content wider than the screen (horizontal scrolling), clipped or overlapping text, text too small to read, or broken images.",
    "Report exactly what you observed. Do not tap any links.",
  ].join("\n");
}

export async function runTask(args: { task: string; idempotencyKey: string }) {
  const { url, token, deviceId } = base();
  const { data } = await requestJson<{ id: string; status: string; streamUrl: string | null }>("mobilerun", `${url}/tasks`, {
    token,
    headers: { "idempotency-key": args.idempotencyKey.slice(0, 128) },
    body: {
      task: args.task,
      deviceId,
      outputSchema: MOBILE_CHECK_SCHEMA,
      maxSteps: 40,
      executionTimeout: 600,
      vision: true,
      recordingEnabled: true,
    },
  });
  return data;
}

export type TaskStatus = {
  status: "prepared" | "queued" | "created" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
  message?: string | null;
  output?: unknown;
  steps?: number | null;
  succeeded?: boolean | null;
  recordingId?: string | null;
};

export async function getTaskStatus(id: string): Promise<TaskStatus> {
  const { url, token } = base();
  const { data } = await requestJson<TaskStatus>("mobilerun", `${url}/tasks/${encodeURIComponent(id)}/status`, { token });
  return data;
}

export const TERMINAL_TASK = new Set(["completed", "failed", "cancelled"]);
