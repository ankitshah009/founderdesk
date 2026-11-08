import { isSoftFinding } from "./humanize";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { approvals, dispatches, drafts, images, jobs, publications, type Dispatch, type Job, type MobileCheck, type Publication } from "@/lib/db/schema";
import { env, isLive } from "@/lib/env";
import { SOCIAL, renderAnnouncement, type SocialDestination } from "@/lib/destinations/social";
import * as mobilerun from "@/lib/integrations/mobilerun";
import { articleSlug } from "@/lib/brief";
import { draftContentHash } from "@/lib/security";
import { links } from "@/lib/links";
import { PermanentError, idempotencyKey, registerHandler } from "./engine";
import { queueMessage, templates } from "./outbound";
import { enqueue, getJob, latestDraft, reviewForDraft, transition } from "./store";

export class GateError extends Error {}

/** Instagram posting runs on the Mobile Run phone where the account is signed in. */
export function instagramConnected(): boolean {
  return isLive("mobilerun") && env().INSTAGRAM_VIA_MOBILERUN === "true";
}

/* ── Founder actions (called from the review page and MCP) ─────────────────── */

/** sha256 over the chosen images' ids and bytes, in order. Empty selection → null. */
export async function hashImages(jobId: string, ids: string[]): Promise<string | null> {
  if (!ids.length) return null;
  const db = await getDb();
  const rows = await db.select({ id: images.id, data: images.data, status: images.status }).from(images).where(and(eq(images.jobId, jobId), inArray(images.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parts = ids.map((id) => {
    const r = byId.get(id);
    if (!r || r.status !== "ready" || !r.data) throw new GateError("One of the chosen images is no longer available. Reload the page.");
    return `${id}:${createHash("sha256").update(r.data).digest("hex")}`;
  });
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export async function approveDraft(args: { jobId: string; draftId: string; contentHash: string; destinations: string[]; xFormat?: "single" | "thread"; imageIds?: string[]; publishAt?: Date | null }) {
  const job = await getJob(args.jobId);
  if (!job) throw new GateError("Order not found.");
  if (job.stage !== "READY_FOR_APPROVAL") throw new GateError("This article is not waiting for approval.");
  const draft = await latestDraft(job.id);
  if (!draft || draft.id !== args.draftId) throw new GateError("A newer version exists. Reload the page to review it.");
  if (draft.contentHash !== args.contentHash) throw new GateError("The article changed since you opened this page. Reload to review the current text.");
  const review = await reviewForDraft(draft.id);
  if (review?.outcome !== "READY_FOR_APPROVAL") throw new GateError("This version has not passed review.");

  const allowed = new Set<string>(["web", ...Object.values(SOCIAL).filter((a) => a.connected()).map((a) => a.id)]);
  if (instagramConnected()) allowed.add("instagram");
  const destinations = ["web", ...args.destinations.filter((d) => d !== "web" && allowed.has(d))];
  const publishAt = normalizePublishAt(args.publishAt ?? null);
  const imageIds = [...new Set(args.imageIds ?? [])];
  const imagesHash = await hashImages(job.id, imageIds);
  if (destinations.includes("instagram") && !imageIds.length) throw new GateError("Choose at least one image to post to Instagram.");
  const db = await getDb();
  await db
    .insert(approvals)
    .values(
      destinations.map((destination) => ({
        jobId: job.id,
        draftId: draft.id,
        contentHash: draft.contentHash,
        destination,
        action: "publish" as const,
        option: destination === "x" ? (args.xFormat === "single" ? "single" : "thread") : null,
        imageIds,
        imagesHash,
        scheduledAt: publishAt,
        approvedBy: job.founderEmail,
      })),
    )
    .onConflictDoNothing();
  const reason = publishAt ? `Scheduled for ${publishAt.toISOString()}` : null;
  if (await transition(job.id, ["READY_FOR_APPROVAL"], "PUBLISHING", reason, { destinations, publishAt })) {
    await enqueue(job.id, "publish", `${job.id}:publish:web:${draft.id}`, { destination: "web", draftId: draft.id }, publishAt ?? undefined);
  }
  return { destinations, publishAt };
}

export const MAX_SCHEDULE_DAYS = 60;

/** A time under 2 minutes away means "now"; past or beyond 60 days is refused. */
export function normalizePublishAt(at: Date | null, now = Date.now()): Date | null {
  if (!at) return null;
  if (Number.isNaN(at.getTime())) throw new GateError("That publish time isn't a valid date.");
  if (at.getTime() < now - 60_000) throw new GateError("That publish time is in the past.");
  if (at.getTime() > now + MAX_SCHEDULE_DAYS * 86_400_000) throw new GateError(`You can schedule up to ${MAX_SCHEDULE_DAYS} days ahead.`);
  return at.getTime() - now < 120_000 ? null : at;
}

/** True while an approved order is waiting for its scheduled time. */
export function isScheduled(job: Pick<Job, "stage" | "publishAt">, now = Date.now()): boolean {
  return job.stage === "PUBLISHING" && !!job.publishAt && job.publishAt.getTime() > now;
}

async function scheduledWebDispatch(jobId: string) {
  const db = await getDb();
  const [d] = await db
    .select()
    .from(dispatches)
    .where(and(eq(dispatches.jobId, jobId), eq(dispatches.kind, "publish"), eq(dispatches.status, "pending"), sql`${dispatches.input}->>'destination' = 'web'`))
    .limit(1);
  return d ?? null;
}

/** Founder changed their mind: publish the scheduled article right away. */
export async function publishNow(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || !isScheduled(job)) return false;
  const d = await scheduledWebDispatch(jobId);
  if (!d) return false;
  const db = await getDb();
  await db.update(dispatches).set({ nextRunAt: new Date() }).where(and(eq(dispatches.id, d.id), eq(dispatches.status, "pending")));
  await db.update(jobs).set({ publishAt: null, stageReason: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  return true;
}

/**
 * Cancel a schedule: withdraw the approvals and return to review. Only while
 * nothing has started — a publish already under way is never interrupted.
 */
export async function cancelSchedule(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job || !isScheduled(job)) return false;
  const d = await scheduledWebDispatch(jobId);
  if (!d) return false;
  const db = await getDb();
  const [cancelled] = await db
    .update(dispatches)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(dispatches.id, d.id), eq(dispatches.status, "pending"), sql`${dispatches.leaseUntil} is null or ${dispatches.leaseUntil} < now()`))
    .returning();
  if (!cancelled) return false;
  await db.delete(approvals).where(eq(approvals.draftId, String(d.input.draftId)));
  // The cancelled dispatch keeps its request key, so re-approval must not reuse it.
  await db.update(dispatches).set({ requestKey: `${d.requestKey}:cancelled:${d.id}` }).where(eq(dispatches.id, d.id));
  return !!(await transition(jobId, ["PUBLISHING"], "READY_FOR_APPROVAL", "Schedule cancelled — approve again when ready", { publishAt: null }));
}

export async function submitFounderEdit(args: { jobId: string; baseDraftId: string; title: string; dek: string; bodyMarkdown: string; announcement: string }) {
  const job = await getJob(args.jobId);
  if (!job || job.stage !== "READY_FOR_APPROVAL") throw new GateError("This article is not open for edits.");
  const base = await latestDraft(job.id);
  if (!base || base.id !== args.baseDraftId) throw new GateError("A newer version exists. Reload before editing.");
  const content = { title: args.title.trim(), dek: args.dek.trim(), bodyMarkdown: args.bodyMarkdown.replace(/\r\n/g, "\n").trim(), announcement: args.announcement.trim() };
  if (!content.title || content.bodyMarkdown.length < 100) throw new GateError("The edited article is too short.");
  const hash = draftContentHash({ ...content, variants: base.variants });
  if (hash === base.contentHash) throw new GateError("No changes to submit.");
  const db = await getDb();
  const [draft] = await db
    .insert(drafts)
    .values({ jobId: job.id, version: base.version + 1, author: "founder_edit", ...content, claims: base.claims, corrections: [], variants: base.variants, contentHash: hash })
    .returning();
  // An edited article goes back through review before it can be approved.
  if (await transition(job.id, ["READY_FOR_APPROVAL"], "REVIEWING", "Reviewing the founder's edits")) {
    await enqueue(job.id, "review", `${job.id}:review:v${draft!.version}:r${job.founderReplies.length}`, { draftId: draft!.id });
  }
  return draft!;
}

/* ── Publication gate ─────────────────────────────────────────────────────── */

async function gate(job: Job, draftId: string, destination: string) {
  if (job.paymentStatus !== "paid") throw new PermanentError("Gate: the order is not paid.");
  const draft = await latestDraft(job.id);
  if (!draft || draft.id !== draftId) throw new PermanentError("Gate: the approved draft is no longer the current draft.");
  const review = await reviewForDraft(draft.id);
  if (review?.outcome !== "READY_FOR_APPROVAL") throw new PermanentError("Gate: the current draft has not passed review.");
  // Only the app's deterministic checks block publication. The reviewer
  // agent's remaining notes were shown to the founder, who approved anyway.
  if (review.findings.some((f) => f.severity === "blocking" && !f.resolved && !isSoftFinding(f))) {
    throw new PermanentError("Gate: blocking findings are unresolved.");
  }
  const db = await getDb();
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.draftId, draft.id), eq(approvals.destination, destination)))
    .limit(1);
  if (!approval) throw new PermanentError(`Gate: no approval for ${destination}.`);
  if (approval.contentHash !== draft.contentHash) throw new PermanentError("Gate: approval does not match the content.");
  let imagesNow: string | null;
  try {
    imagesNow = await hashImages(draft.jobId, approval.imageIds);
  } catch {
    imagesNow = "missing";
  }
  if (imagesNow !== approval.imagesHash) throw new PermanentError("Gate: the approved images changed after approval.");
  return { draft, approval };
}

/** Fetch the public page and confirm the approved version is what is served. */
export async function verifyServed(url: string, contentHash: string, title: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "user-agent": "FounderDeskVerifier/1.0" }, signal: AbortSignal.timeout(20_000) });
  const html = await res.text();
  const hashOk = html.includes(`name="founderdesk:content-hash" content="${contentHash}"`);
  const titleOk = html.includes(escapeHtml(title)) || html.includes(title);
  const ok = res.status === 200 && hashOk && titleOk;
  return {
    ok,
    checkedAt: new Date().toISOString(),
    httpStatus: res.status,
    detail: ok ? "Served page matches the approved content hash and headline" : `status ${res.status}, hash ${hashOk ? "ok" : "missing"}, headline ${titleOk ? "ok" : "missing"}`,
  };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

async function webPublication(jobId: string): Promise<Publication | null> {
  const db = await getDb();
  const [row] = await db.select().from(publications).where(and(eq(publications.jobId, jobId), eq(publications.destination, "web"))).limit(1);
  return row ?? null;
}

/* ── publish ───────────────────────────────────────────────────────────────── */

registerHandler("publish", {
  async start(d: Dispatch) {
    const job = await getJob(d.jobId);
    if (!job) throw new PermanentError("Job not found");
    const destination = String(d.input.destination);
    const { draft, approval } = await gate(job, String(d.input.draftId), destination);
    const db = await getDb();

    if (destination === "web") {
      let pub = await webPublication(job.id);
      if (pub && pub.draftId !== draft.id) throw new PermanentError("Gate: this order already has a published article.");
      if (!pub) {
        const slug = articleSlug(draft.title, job.id);
        [pub] = await db
          .insert(publications)
          .values({ jobId: job.id, draftId: draft.id, approvalId: approval.id, destination, slug, url: links.article(slug), contentHash: draft.contentHash, status: "publishing" })
          .onConflictDoNothing()
          .returning();
        pub ??= (await webPublication(job.id))!;
      }
      const verification = await verifyServed(pub.url!, draft.contentHash, draft.title);
      await db.update(publications).set({ verification }).where(eq(publications.id, pub.id));
      if (!verification.ok) throw new Error(`Published page did not verify: ${verification.detail}`);
      return { done: { publicationId: pub.id, url: pub.url, verification } };
    }

    if (destination === "instagram") {
      if (!instagramConnected()) throw new PermanentError("Instagram is not connected on the Mobile Run device");
      const web = await webPublication(job.id);
      if (web?.status !== "published") throw new Error("Waiting for the web article to be published");
      const ig = draft.variants.instagram;
      if (!ig) throw new PermanentError("This draft has no Instagram version");
      const imgs = approval.imageIds.map((id) => ({ id }));
      if (!imgs.length) throw new PermanentError("Instagram needs at least one image — add images before approving Instagram");
      const [existing] = await db.select().from(publications).where(and(eq(publications.jobId, job.id), eq(publications.destination, "instagram"))).limit(1);
      if (existing?.status === "published") return { done: { publicationId: existing.id, url: existing.url } };
      if (existing && !existing.externalId) {
        throw new PermanentError("An earlier Instagram post attempt may have gone through. Check the account before retrying.");
      }
      const base = links.article("").replace(/\/a\/$/, "");
      const [row] = await db
        .insert(publications)
        .values({ jobId: job.id, draftId: draft.id, approvalId: approval.id, destination, contentHash: draft.contentHash, status: "publishing" })
        .returning();
      const task = await mobilerun.runTask({
        task: mobilerun.instagramPostTask(imgs.slice(0, 10).map((i) => `${base}/api/images/${i.id}`), ig.slides, ig.caption),
        idempotencyKey: idempotencyKey(d),
        outputSchema: mobilerun.INSTAGRAM_POST_SCHEMA,
        maxSteps: 80,
      });
      await db.update(publications).set({ externalId: `mobilerun:${task.id}` }).where(eq(publications.id, row!.id));
      return { started: task.id, provider: "mobilerun" };
    }

    // Social announcement: needs the live article URL first.
    const adapter = SOCIAL[destination as SocialDestination];
    if (!adapter?.connected()) throw new PermanentError(`${destination} is not connected`);
    const web = await webPublication(job.id);
    if (web?.status !== "published") throw new Error("Waiting for the web article to be published");
    const [existing] = await db.select().from(publications).where(and(eq(publications.jobId, job.id), eq(publications.destination, destination))).limit(1);
    if (existing?.status === "published") return { done: { publicationId: existing.id, url: existing.url } };
    if (existing && !existing.externalId) {
      throw new PermanentError(`An earlier ${adapter.label} post attempt may have gone through. Check the account before retrying.`);
    }
    const variant =
      destination === "x"
        ? approval.option === "single"
          ? (draft.variants.xSingle ?? draft.announcement)
          : draft.variants.x
        : destination === "linkedin"
          ? draft.variants.linkedin
          : undefined;
    const posts = Array.isArray(variant)
      ? variant.map((t) => renderAnnouncement(t, web.url!, adapter.maxLength))
      : [renderAnnouncement(variant ?? draft.announcement, web.url!, adapter.maxLength)];
    const text = posts[0]!;
    const [row] = await db
      .insert(publications)
      .values({ jobId: job.id, draftId: draft.id, approvalId: approval.id, destination, contentHash: draft.contentHash, status: "publishing" })
      .returning();
    const posted = await adapter.post(text, posts.slice(1));
    await db.update(publications).set({ externalId: posted.externalId, url: posted.url }).where(eq(publications.id, row!.id));
    const check = await adapter.verify(posted.externalId);
    const verification = { ok: check.ok, checkedAt: new Date().toISOString(), detail: check.detail };
    await db.update(publications).set({ verification, status: check.ok ? "published" : "verify_failed" }).where(eq(publications.id, row!.id));
    return { done: { publicationId: row!.id, url: posted.url, verification } };
  },
  pollEveryMs: 10_000,
  // Only Instagram (via Mobile Run) is asynchronous: wait for the phone task.
  async poll(d) {
    const s = await mobilerun.getTaskStatus(d.providerRef!);
    if (!mobilerun.TERMINAL_TASK.has(s.status)) return { running: true };
    const o = (s.output ?? {}) as { posted?: boolean; postUrl?: string | null; problems?: string[] };
    // A finished task is not a post: require success and a real post link.
    if (s.status === "completed" && o.posted && o.postUrl && /^https:\/\/(www\.)?instagram\.com\/(p|reel)\//.test(o.postUrl)) return { done: { postUrl: o.postUrl } };
    return { failed: `Instagram post not confirmed: ${o.problems?.join("; ") || s.message || s.status}`, retryable: false };
  },
  async complete(d, output) {
    const out = output as { publicationId: string; url: string; postUrl?: string };
    const destination = String(d.input.destination);
    const db = await getDb();
    if (destination === "instagram" && out.postUrl) {
      await db
        .update(publications)
        .set({ status: "published", url: out.postUrl, verification: { ok: true, checkedAt: new Date().toISOString(), detail: "Post link reported by the phone agent after sharing" } })
        .where(and(eq(publications.jobId, d.jobId), eq(publications.destination, "instagram")));
      return;
    }
    if (destination !== "web") return;
    await db.update(publications).set({ status: "published" }).where(eq(publications.id, out.publicationId));
    const job = await transition(d.jobId, ["PUBLISHING"], "PUBLISHED");
    if (!job) return;
    await queueMessage(job, "published", `${job.id}:published:${out.publicationId}`, templates.published(job, out.url));
    await enqueue(job.id, "mobile_check", `${job.id}:mobile:${out.publicationId}`, { publicationId: out.publicationId });
    for (const dest of job.destinations.filter((x) => x !== "web")) {
      await enqueue(job.id, "publish", `${job.id}:publish:${dest}:${d.input.draftId}`, { destination: dest, draftId: d.input.draftId });
    }
  },
  async fail(d, reason) {
    const db = await getDb();
    if (String(d.input.destination) === "web") {
      const pub = await webPublication(d.jobId);
      if (pub) await db.update(publications).set({ status: "verify_failed" }).where(eq(publications.id, pub.id));
      await db.update(jobs).set({ stageReason: `Publishing stopped: ${reason}` }).where(eq(jobs.id, d.jobId));
    } else {
      const [row] = await db.select().from(publications).where(and(eq(publications.jobId, d.jobId), eq(publications.destination, String(d.input.destination)))).orderBy(desc(publications.createdAt)).limit(1);
      if (row && row.status !== "published") await db.update(publications).set({ status: "failed", verification: { ok: false, checkedAt: new Date().toISOString(), detail: reason } }).where(eq(publications.id, row.id));
    }
  },
});

/* ── mobile_check ──────────────────────────────────────────────────────────── */

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Without a device: an honest, clearly-labelled HTTP check with a phone UA. */
export async function httpMobileCheck(url: string, headline: string): Promise<MobileCheck> {
  const res = await fetch(url, { headers: { "user-agent": IPHONE_UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const html = await res.text();
  const problems: string[] = [];
  if (!/<meta[^>]+name="viewport"[^>]+width=device-width/i.test(html)) problems.push("No responsive viewport meta tag");
  const sourcesSection = html.split(/id="sources"/i)[1] ?? "";
  const sourceLinks = (sourcesSection.match(/<a [^>]*href="https?:\/\//gi) ?? []).length;
  const headlineVisible = html.includes(escapeHtml(headline)) || html.includes(headline);
  if (/<table/i.test(html) && !/overflow-x/i.test(html)) problems.push("Table without horizontal overflow handling");
  return {
    mode: "http-fallback",
    status: res.status === 200 && headlineVisible && problems.length === 0 ? "passed" : "issues",
    headlineVisible,
    scrolledToEnd: res.status === 200,
    sourceLinksPresent: sourceLinks > 0,
    layoutProblems: res.status === 200 ? problems : [`HTTP ${res.status}`],
    message: "HTTP check with a mobile user agent. No device was used — connect Mobile Run for a real phone check.",
    checkedAt: new Date().toISOString(),
  };
}

async function loadPub(d: Dispatch) {
  const db = await getDb();
  const [pub] = await db.select().from(publications).where(eq(publications.id, String(d.input.publicationId))).limit(1);
  if (!pub) throw new PermanentError("Publication not found");
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, pub.draftId)).limit(1);
  return { pub, draft: draft! };
}

registerHandler("mobile_check", {
  pollEveryMs: 8_000,
  async start(d) {
    const { pub, draft } = await loadPub(d);
    if (!isLive("mobilerun")) return { done: await httpMobileCheck(pub.url!, draft.title), simulated: true };
    const task = await mobilerun.runTask({ task: mobilerun.mobileCheckTask(pub.url!, draft.title), idempotencyKey: idempotencyKey(d) });
    const db = await getDb();
    await db.update(publications).set({ mobileCheck: { mode: "device", status: "running", taskId: task.id } }).where(eq(publications.id, pub.id));
    return { started: task.id, provider: "mobilerun" };
  },
  async poll(d) {
    const s = await mobilerun.getTaskStatus(d.providerRef!);
    if (!mobilerun.TERMINAL_TASK.has(s.status)) return { running: true };
    // Acceptance or completion alone is not a check: require success + a result.
    if (s.status !== "completed" || !s.succeeded || !s.output) return { failed: `Mobile Run task ${s.status}${s.message ? `: ${s.message}` : ""}`, retryable: false };
    const o = s.output as { pageLoaded: boolean; headlineVisible: boolean; scrolledToEnd: boolean; sourceLinksPresent: boolean; layoutProblems: string[] };
    const ok = o.pageLoaded && o.headlineVisible && o.scrolledToEnd && o.sourceLinksPresent && o.layoutProblems.length === 0;
    const check: MobileCheck = {
      mode: "device",
      status: ok ? "passed" : "issues",
      taskId: d.providerRef!,
      headlineVisible: o.headlineVisible,
      scrolledToEnd: o.scrolledToEnd,
      sourceLinksPresent: o.sourceLinksPresent,
      layoutProblems: o.layoutProblems,
      message: s.message ?? undefined,
      recordingId: s.recordingId ?? null,
      checkedAt: new Date().toISOString(),
    };
    return { done: check };
  },
  async complete(d, output) {
    const db = await getDb();
    await db.update(publications).set({ mobileCheck: output as MobileCheck }).where(eq(publications.id, String(d.input.publicationId)));
    const check = output as MobileCheck;
    await transition(d.jobId, ["PUBLISHED"], "COMPLETE", check.status === "passed" ? null : "Phone check reported layout issues");
  },
  async fail(d, reason) {
    const db = await getDb();
    await db
      .update(publications)
      .set({ mobileCheck: { mode: isLive("mobilerun") ? "device" : "http-fallback", status: "failed", message: reason, checkedAt: new Date().toISOString() } })
      .where(eq(publications.id, String(d.input.publicationId)));
    await transition(d.jobId, ["PUBLISHED"], "COMPLETE", `Phone check could not run: ${reason}`);
  },
});
