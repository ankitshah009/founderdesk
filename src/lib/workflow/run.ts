import { after } from "next/server";
import "./handlers";
import "./publish";
import "./images";
import "./revise";
import { nextWakeAt, step } from "./engine";
import { deliverOutbound } from "./outbound";
import { resumeStaleWaits } from "./intake";

/**
 * Drive the workflow for up to `budgetMs`: deliver queued mail, run every
 * runnable dispatch, and sleep until the next poll is due. Safe to run from
 * many places at once (webhook after(), cron, page polls) thanks to leases.
 */
export async function runWork({ budgetMs = 45_000, idleExitMs = 20_000 } = {}): Promise<{ steps: number }> {
  const deadline = Date.now() + budgetMs;
  let steps = 0;
  await resumeStaleWaits();
  while (Date.now() < deadline) {
    await deliverOutbound();
    let progressed = false;
    while (Date.now() < deadline && (await step())) {
      progressed = true;
      steps++;
    }
    await deliverOutbound();
    const wake = await nextWakeAt();
    if (!wake) break;
    const wait = wake.getTime() - Date.now();
    if (wait > idleExitMs || Date.now() + wait > deadline) break;
    if (!progressed && wait <= 0) await sleep(250);
    else if (wait > 0) await sleep(Math.min(wait, 5_000));
  }
  return { steps };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kick the workflow after the current response has been sent, and keep it
 * moving: wait through the short polls of agent sessions (Naive, Monid,
 * Mobile Run) instead of leaving them for the next cron tick, so each step,
 * and the email that follows it, happens within seconds.
 */
export function kick() {
  after(async () => {
    try {
      await runWork({ budgetMs: 55_000, idleExitMs: 50_000 });
    } catch (err) {
      console.error("[founderdesk] workflow run failed", err);
    }
  });
}
