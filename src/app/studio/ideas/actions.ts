"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAuthor, nextTuesday, platformFromUrl } from "@/components/ideas/capture-helpers";
import { getDb } from "@/lib/db/client";
import { POST_PLATFORMS, calendarEntries, ideas, socialPosts, type PostPlatform } from "@/lib/db/schema";
import { env, isLive } from "@/lib/env";
import * as monid from "@/lib/integrations/monid";
import { links } from "@/lib/links";
import { generateHooks, hookTournament, normalizePlatform, parsePostsCsv, trendRadar, type Radar, type TrendSignal } from "@/lib/studio/ideas";
import { StudioAuthError, requireStudio } from "@/lib/studio/session";
import { getIdea, getProfile, listPosts } from "@/lib/studio/store";
import { createJob } from "@/lib/workflow/intake";
import { kick } from "@/lib/workflow/run";

export type IdeaActionState = { error?: string; ok?: string } | null;
export type NewsState = { error?: string; radar?: Radar; checkedAt?: string } | null;

const SIGNED_OUT = "Your session ended. Sign in to the Studio again.";
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const platformSchema = z.enum(POST_PLATFORMS);

async function ownIdea(email: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  return getIdea(email, id);
}

/* ── Ideas ─────────────────────────────────────────────────────────────── */

const ideaSchema = z.object({
  title: z.string().trim().min(8, "Write the idea in one line (at least a few words)").max(200, "Keep the idea to one line"),
  notes: z.string().trim().max(10_000).default(""),
  platform: platformSchema.default("linkedin"),
  hooks: z.string().max(4000).default(""),
});

export async function createIdea(_: IdeaActionState, form: FormData): Promise<IdeaActionState> {
  let email: string;
  try {
    ({ email } = await requireStudio());
  } catch (e) {
    if (e instanceof StudioAuthError) return { error: SIGNED_OUT };
    throw e;
  }
  const parsed = ideaSchema.safeParse({ title: str(form, "title"), notes: str(form, "notes"), platform: str(form, "platform") || undefined, hooks: str(form, "hooks") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const hooks = [...new Set(v.hooks.split("\n").map((h) => h.trim()).filter(Boolean))].slice(0, 8).map((h) => h.slice(0, 400));
  const db = await getDb();
  const [row] = await db.insert(ideas).values({ ownerEmail: email, title: v.title, notes: v.notes, platform: v.platform, hooks }).returning({ id: ideas.id });
  redirect(`/studio/ideas/${row!.id}`);
}

async function setHooks(ideaId: string, email: string, hooks: string[]) {
  const db = await getDb();
  await db
    .update(ideas)
    .set({ hooks: hooks.slice(0, 12), updatedAt: new Date() })
    .where(and(eq(ideas.id, ideaId), eq(ideas.ownerEmail, email)));
}

/** "Use this hook": move (or add) it to the first position of the idea's hooks. */
export async function chooseHook(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  const hook = str(form, "hook").slice(0, 400);
  if (!idea || !hook) return;
  await setHooks(idea.id, email, [hook, ...idea.hooks.filter((h) => h !== hook)]);
  refresh();
}

export async function addOwnHook(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  const hook = str(form, "hook").replace(/\s+/g, " ").slice(0, 400);
  if (!idea || !hook || idea.hooks.includes(hook)) return;
  await setHooks(idea.id, email, [...idea.hooks, hook]);
  refresh();
}

export async function removeHook(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  const hook = str(form, "hook");
  if (!idea) return;
  await setHooks(idea.id, email, idea.hooks.filter((h) => h !== hook));
  refresh();
}

/** "Plan it": a calendar slot next Tuesday, from the founder. */
export async function planIdea(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  if (!idea || idea.status === "planned") return;
  const db = await getDb();
  const notes = [idea.hooks[0] ? `Hook: ${idea.hooks[0]}` : "", idea.notes].filter(Boolean).join("\n\n").slice(0, 4000);
  await db.insert(calendarEntries).values({ ownerEmail: email, title: idea.title, notes, date: nextTuesday(), origin: "founder" });
  await db.update(ideas).set({ status: "planned", updatedAt: new Date() }).where(and(eq(ideas.id, idea.id), eq(ideas.ownerEmail, email)));
  refresh();
}

/** "Write the article": open an order with the idea and its best hook as the brief. */
export async function writeArticle(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  if (!idea) return;
  const [profile, posts] = await Promise.all([getProfile(email), listPosts(email)]);
  const best =
    idea.hooks[0] ??
    hookTournament({ hooks: generateHooks({ title: idea.title, notes: idea.notes, audience: profile.brand?.audience }), ownHooks: [], posts, platform: idea.platform }).ranked[0]?.hook ??
    "";
  const body = [idea.notes || idea.title, best ? `\nOpening hook: ${best}` : ""].join("\n");
  const job = await createJob({ channel: "web", founderEmail: email, founderName: profile.displayName ?? null, subject: idea.title, body });
  const db = await getDb();
  await db.update(ideas).set({ status: "ordered", updatedAt: new Date() }).where(and(eq(ideas.id, idea.id), eq(ideas.ownerEmail, email)));
  kick();
  redirect(links.orderPath(job.id));
}

export async function setIdeaStatus(form: FormData) {
  const { email } = await requireStudio();
  const idea = await ownIdea(email, str(form, "ideaId"));
  const status = z.enum(["exploring", "archived"]).safeParse(str(form, "status"));
  if (!idea || !status.success) return;
  const db = await getDb();
  await db.update(ideas).set({ status: status.data, updatedAt: new Date() }).where(and(eq(ideas.id, idea.id), eq(ideas.ownerEmail, email)));
  refresh();
}

/* ── Posts: history and swipe file ─────────────────────────────────────── */

const count = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const clean = v.replace(/[, ]/g, "");
    if (!clean) return null;
    const n = Number(clean);
    if (!Number.isInteger(n) || n < 0 || n > 2_000_000_000) {
      ctx.addIssue({ code: "custom", message: "Metrics must be whole numbers (e.g. 1200)" });
      return z.NEVER;
    }
    return n;
  });

const postSchema = z.object({
  author: z.string().trim().max(80).default("me"),
  platform: z.string().trim().default(""),
  url: z.union([z.literal(""), z.string().trim().url("Enter a full URL, starting with https://").max(2000)]).default(""),
  text: z.string().trim().min(10, "Paste the post's text (at least a sentence)").max(5000),
  date: z.string().trim().default(""),
  likes: count,
  comments: count,
  shares: count,
  impressions: count,
  followers: count,
  via: z.enum(["manual", "bookmarklet"]).default("manual"),
});

export async function addPost(_: IdeaActionState, form: FormData): Promise<IdeaActionState> {
  let email: string;
  try {
    ({ email } = await requireStudio());
  } catch (e) {
    if (e instanceof StudioAuthError) return { error: SIGNED_OUT };
    throw e;
  }
  const field = (k: string) => str(form, k);
  const parsed = postSchema.safeParse({
    author: field("author") || "me",
    platform: field("platform"),
    url: field("url"),
    text: field("text"),
    date: field("date"),
    likes: field("likes"),
    comments: field("comments"),
    shares: field("shares"),
    impressions: field("impressions"),
    followers: field("followers"),
    via: field("via") || "manual",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const v = parsed.data;
  const postedAt = v.date ? new Date(v.date) : null;
  if (postedAt && Number.isNaN(postedAt.getTime())) return { error: "That date doesn't look right" };
  const platform: PostPlatform = platformSchema.safeParse(v.platform).success ? (v.platform as PostPlatform) : (platformFromUrl(v.url) ?? normalizePlatform(v.platform));
  const author = normalizeAuthor(v.author);
  const db = await getDb();
  await db.insert(socialPosts).values({
    ownerEmail: email,
    author,
    platform,
    url: v.url || null,
    text: v.text,
    postedAt,
    likes: v.likes ?? 0,
    comments: v.comments ?? 0,
    shares: v.shares ?? 0,
    impressions: v.impressions,
    followers: v.followers,
    capturedVia: v.via,
  });
  if (v.via === "bookmarklet") redirect("/studio/ideas/library?saved=1");
  refresh();
  return { ok: author === "me" ? "Saved to your post history." : `Saved ${author}'s post to your swipe file.` };
}

export async function importCsv(_: IdeaActionState, form: FormData): Promise<IdeaActionState> {
  let email: string;
  try {
    ({ email } = await requireStudio());
  } catch (e) {
    if (e instanceof StudioAuthError) return { error: SIGNED_OUT };
    throw e;
  }
  const raw = String(form.get("csv") ?? "");
  if (raw.length > 2_000_000) return { error: "That's too much at once. Paste under 2 MB per import." };
  const rows = parsePostsCsv(raw);
  if (!rows.length) return { error: "No posts found. The first row must be a header that includes a text column." };
  const db = await getDb();
  const values = rows.slice(0, 1000).map((r) => ({ ...r, author: normalizeAuthor(r.author), ownerEmail: email, capturedVia: "csv" as const }));
  for (let i = 0; i < values.length; i += 200) await db.insert(socialPosts).values(values.slice(i, i + 200));
  refresh();
  const mine = values.filter((v) => v.author === "me").length;
  return { ok: `Imported ${values.length} posts (${mine} yours, ${values.length - mine} from creators)${rows.length > 1000 ? ". Only the first 1,000 rows were imported" : ""}.` };
}

export async function deletePost(form: FormData) {
  const { email } = await requireStudio();
  const ids = form.getAll("postId").map(String).filter((id) => z.string().uuid().safeParse(id).success);
  if (!ids.length) return;
  const db = await getDb();
  await db.delete(socialPosts).where(and(eq(socialPosts.ownerEmail, email), inArray(socialPosts.id, ids)));
  refresh();
}

/* ── Trend Timing Radar: live news via Monid ──────────────────────────── */

function newsSearchConfigured(): boolean {
  const e = env();
  return isLive("monid") && Boolean(e.MONID_SEARCH_PROVIDER && e.MONID_SEARCH_ENDPOINT);
}

export async function checkNews(_: NewsState, form: FormData): Promise<NewsState> {
  let email: string;
  try {
    ({ email } = await requireStudio());
  } catch (e) {
    if (e instanceof StudioAuthError) return { error: SIGNED_OUT };
    throw e;
  }
  const idea = await ownIdea(email, str(form, "ideaId"));
  if (!idea) return { error: "Idea not found." };
  if (!newsSearchConfigured()) return { error: "Connect Monid search for live news signals." };
  const e = env();
  try {
    let run = await monid.run(e.MONID_SEARCH_PROVIDER!, e.MONID_SEARCH_ENDPOINT!, monid.fillTemplate(e.MONID_SEARCH_INPUT, { query: idea.title }));
    const deadline = Date.now() + 25_000;
    while (!monid.TERMINAL.has(run.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2_000));
      run = await monid.getRun(run.runId);
    }
    if (run.status !== "COMPLETED" || (run.providerResponse?.httpStatus ?? 200) >= 400 || run.providerResponse?.error) {
      return { error: run.status === "COMPLETED" ? "The search provider returned an error. Try again later." : `The news search didn't finish (${run.status.toLowerCase()}). Try again.` };
    }
    const signals: TrendSignal[] = monid.normalizeDocs(run.output, 10).map((d) => ({
      title: d.title ?? d.snippet?.slice(0, 120) ?? d.url,
      date: d.publishedDate && !Number.isNaN(new Date(d.publishedDate).getTime()) ? new Date(d.publishedDate).toISOString() : null,
      url: d.url,
      source: (() => {
        try {
          return new URL(d.url).hostname.replace(/^www\./, "");
        } catch {
          return "web";
        }
      })(),
    }));
    const posts = await listPosts(email);
    const radar = trendRadar({ idea: `${idea.title}\n${idea.notes}`, posts, signals, platform: idea.platform });
    if (!signals.length) radar.evidence.push("The news search returned no results for this idea.");
    return { radar, checkedAt: new Date().toISOString() };
  } catch (err) {
    return { error: `News search failed: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}` };
  }
}
