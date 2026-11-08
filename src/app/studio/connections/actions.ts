"use server";

import { refresh } from "next/cache";
import { disconnectAccount, setAutoPost } from "@/lib/social/accounts";
import { isProvider } from "@/lib/social/oauth";
import { requireStudio } from "@/lib/studio/session";

/** Owner-scoped: every change is keyed by the signed-in founder's email. */

export async function toggleAutoPost(form: FormData) {
  const { email } = await requireStudio();
  const provider = String(form.get("provider") ?? "");
  if (!isProvider(provider)) throw new Error("Unknown provider");
  await setAutoPost(email, provider, form.get("autoPost") === "on");
  refresh();
}

export async function disconnect(form: FormData) {
  const { email } = await requireStudio();
  const provider = String(form.get("provider") ?? "");
  if (!isProvider(provider)) throw new Error("Unknown provider");
  await disconnectAccount(email, provider);
  refresh();
}

/* ── Accounts signed in on the Mobile Run phone ────────────────────────── */

export type PhoneCheckState = { token?: string; running?: boolean; handle?: string; error?: string };

async function sealCheck(payload: { t: string; e: string; p: string }): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const { appSecret } = await import("@/lib/env");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", appSecret()).update(`phone-check:${body}`).digest("base64url")}`;
}

async function openCheck(token: string): Promise<{ t: string; e: string; p: string } | null> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const { appSecret } = await import("@/lib/env");
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", appSecret()).update(`phone-check:${body}`).digest("base64url"));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString()) as { t: string; e: string; p: string };
}

/** Start a read-only check of which account is signed in to the app on the phone. */
export async function startPhoneCheck(provider: string): Promise<PhoneCheckState> {
  const { email } = await requireStudio();
  if (!isProvider(provider)) return { error: "Unknown platform." };
  const { isLive } = await import("@/lib/env");
  if (!isLive("mobilerun")) return { error: "Mobile Run isn't connected on this deployment yet." };
  const mobilerun = await import("@/lib/integrations/mobilerun");
  try {
    const task = await mobilerun.runTask({
      task: mobilerun.accountCheckTask(provider),
      idempotencyKey: `phone-check:${email}:${provider}:${Date.now()}`,
      outputSchema: mobilerun.ACCOUNT_CHECK_SCHEMA,
      maxSteps: 25,
    });
    return { running: true, token: await sealCheck({ t: task.id, e: email.toLowerCase(), p: provider }) };
  } catch {
    return { error: "The phone didn't accept the check. Make sure the Mobile Run device is running, then try again." };
  }
}

/** Poll the check; when the phone reports a signed-in account, link it to this founder. */
export async function pollPhoneCheck(token: string): Promise<PhoneCheckState> {
  const { email } = await requireStudio();
  const check = await openCheck(token);
  if (!check || check.e !== email.toLowerCase() || !isProvider(check.p)) return { error: "This check doesn't belong to your account." };
  const mobilerun = await import("@/lib/integrations/mobilerun");
  const s = await mobilerun.getTaskStatus(check.t);
  if (!mobilerun.TERMINAL_TASK.has(s.status)) return { running: true, token };
  const o = (s.output ?? {}) as { signedIn?: boolean; handle?: string | null; problems?: string[] };
  if (s.status !== "completed" || !o.signedIn || !o.handle?.trim()) {
    return { error: o.signedIn === false ? "No account is signed in to that app on the phone yet. Sign in there, then check again." : `The phone couldn't confirm the account${o.problems?.length ? `: ${o.problems.join("; ")}` : "."}` };
  }
  const { connectViaMobileRun } = await import("@/lib/social/accounts");
  await connectViaMobileRun(email, check.p, o.handle);
  refresh();
  return { handle: o.handle.trim() };
}
