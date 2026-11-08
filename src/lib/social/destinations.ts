import { env, isLive } from "@/lib/env";
import { availableCms } from "@/lib/destinations/cms";
import { SOCIAL } from "@/lib/destinations/social";
import { listAccounts } from "./accounts";

/** Instagram posting on the Mobile Run phone where the operator's account is signed in. */
export function instagramViaMobileRun(): boolean {
  return isLive("mobilerun") && env().INSTAGRAM_VIA_MOBILERUN === "true";
}

export type ApprovalDestination = {
  id: string;
  label: string;
  kind: "social" | "cms";
  via: "founder" | "env" | "mobilerun" | "cms";
  handle: string | null;
  simulated: boolean;
  /** Pre-ticked at approval. Approval is still required. */
  autoPost: boolean;
};

/**
 * Destinations a founder may approve, beyond the web article: their own
 * connected accounts, else the operator's env-connected accounts, plus CMSs.
 * approveDraft drops anything not in this list.
 */
export async function approvalDestinations(founderEmail: string): Promise<ApprovalDestination[]> {
  const accounts = (await listAccounts(founderEmail)).filter((a) => a.status === "connected");
  const out: ApprovalDestination[] = [];
  for (const id of ["x", "linkedin"] as const) {
    const a = accounts.find((x) => x.provider === id);
    const label = SOCIAL[id].label;
    if (a) out.push({ id, label: `Announce on ${label} as ${a.handle}${a.via === "mobilerun" ? " (from your phone)" : ""}`, kind: "social", via: a.via === "mobilerun" ? "mobilerun" : "founder", handle: a.handle, simulated: a.simulated, autoPost: a.autoPost });
    else if (SOCIAL[id].connected()) out.push({ id, label: `Announce on ${label}`, kind: "social", via: "env", handle: null, simulated: false, autoPost: false });
  }
  const ig = accounts.find((x) => x.provider === "instagram");
  if (ig) out.push({ id: "instagram", label: `Post to Instagram as ${ig.handle}${ig.via === "mobilerun" ? " (from your phone)" : ""}`, kind: "social", via: ig.via === "mobilerun" ? "mobilerun" : "founder", handle: ig.handle, simulated: ig.simulated, autoPost: ig.autoPost });
  else if (instagramViaMobileRun()) out.push({ id: "instagram", label: "Post to Instagram (via Mobile Run)", kind: "social", via: "mobilerun", handle: null, simulated: false, autoPost: false });
  for (const c of availableCms()) out.push({ id: c.id, label: `Publish to ${c.label}`, kind: "cms", via: "cms", handle: null, simulated: c.simulated, autoPost: false });
  return out;
}
