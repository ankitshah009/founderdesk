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
