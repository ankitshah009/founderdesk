"use server";

import { refresh } from "next/cache";
import { requireStudio } from "@/lib/studio/session";
import { kick } from "@/lib/workflow/run";

export type QueueActionState = { ok?: string; error?: string } | null;

/** Owner-scoped: every change is checked against the signed-in founder's own orders. */
export async function queueAction(_: QueueActionState, form: FormData): Promise<QueueActionState> {
  const { email } = await requireStudio();
  const jobId = String(form.get("jobId") ?? "");
  const destination = String(form.get("destination") ?? "");
  const op = String(form.get("op") ?? "");
  const { GateError } = await import("@/lib/workflow/publish");
  const q = await import("@/lib/workflow/scheduler");
  try {
    if (op === "now") {
      await q.postNow(email, jobId, destination);
      kick();
      refresh();
      return { ok: "Going out now." };
    }
    if (op === "cancel") {
      await q.cancelPost(email, jobId, destination);
      refresh();
      return { ok: "Removed from the queue." };
    }
    if (op === "move") {
      const raw = String(form.get("at") ?? "");
      if (!raw) return { error: "Pick a date and time." };
      await q.reschedule(email, jobId, destination, new Date(raw));
      refresh();
      return { ok: "Rescheduled." };
    }
    return { error: "Unknown action." };
  } catch (err) {
    if (err instanceof GateError) return { error: err.message };
    throw err;
  }
}
