import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agentRuns,
  calendarEntries,
  ideas,
  jobs,
  knowledgeItems,
  memories,
  profiles,
  socialPosts,
  workflows,
  type AgentRole,
  type Job,
  type KnowledgeItem,
  type Memory,
  type Persona,
  type Profile,
  type Workflow,
} from "@/lib/db/schema";
import { keywords } from "@/lib/workflow/editorial";
import { cadenceDates, ymd } from "./calendar";
import { DEFAULT_PERSONAS } from "./presets";
import { EMPTY_STYLE, effectiveGuide } from "./style";
import { analyzeVoice } from "./voice";

/** Database access for the founder's workspace. Every query is scoped by owner email. */

export async function getProfile(email: string): Promise<Profile> {
  const db = await getDb();
  const key = email.toLowerCase();
  const [row] = await db.select().from(profiles).where(eq(profiles.email, key)).limit(1);
  if (row) return row;
  const [created] = await db.insert(profiles).values({ email: key, personas: DEFAULT_PERSONAS, styleGuide: EMPTY_STYLE }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(profiles).where(eq(profiles.email, key)).limit(1))[0]!;
}

export async function updateProfile(email: string, patch: Partial<Omit<Profile, "email" | "createdAt">>) {
  await getProfile(email);
  const db = await getDb();
  const [row] = await db.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.email, email.toLowerCase())).returning();
  return row!;
}

export async function listKnowledge(email: string): Promise<KnowledgeItem[]> {
  const db = await getDb();
  return db.select().from(knowledgeItems).where(eq(knowledgeItems.ownerEmail, email.toLowerCase())).orderBy(desc(knowledgeItems.pinned), desc(knowledgeItems.updatedAt));
}

export async function addKnowledge(email: string, items: Array<Pick<KnowledgeItem, "kind" | "title" | "content"> & Partial<Pick<KnowledgeItem, "url" | "pinned">>>) {
  if (!items.length) return [];
  const db = await getDb();
  const rows = await db
    .insert(knowledgeItems)
    .values(items.map((i) => ({ ownerEmail: email.toLowerCase(), kind: i.kind, title: i.title.slice(0, 200), content: i.content.slice(0, 20_000), url: i.url ?? null, pinned: i.pinned ?? false })))
    .returning();
  if (items.some((i) => i.kind === "sample")) await refreshVoice(email);
  return rows;
}

/** Re-learn the voice from every writing sample the founder has saved. */
export async function refreshVoice(email: string) {
  const db = await getDb();
  const samples = await db.select({ content: knowledgeItems.content }).from(knowledgeItems).where(and(eq(knowledgeItems.ownerEmail, email.toLowerCase()), eq(knowledgeItems.kind, "sample")));
  const voice = analyzeVoice(samples.map((s) => s.content));
  await updateProfile(email, { voice });
  return voice;
}

export async function listMemories(email: string): Promise<Memory[]> {
  const db = await getDb();
  return db.select().from(memories).where(eq(memories.ownerEmail, email.toLowerCase())).orderBy(desc(memories.createdAt));
}

export async function remember(email: string, m: Pick<Memory, "kind" | "text" | "origin"> & { jobId?: string | null }) {
  const db = await getDb();
  const text = m.text.trim().slice(0, 500);
  if (!text) return null;
  const [dup] = await db.select({ id: memories.id }).from(memories).where(and(eq(memories.ownerEmail, email.toLowerCase()), eq(memories.text, text))).limit(1);
  if (dup) return null;
  const [row] = await db.insert(memories).values({ ownerEmail: email.toLowerCase(), kind: m.kind, text, origin: m.origin, jobId: m.jobId ?? null }).returning();
  return row!;
}

export async function listWorkflows(email: string): Promise<Workflow[]> {
  const db = await getDb();
  return db.select().from(workflows).where(eq(workflows.ownerEmail, email.toLowerCase())).orderBy(asc(workflows.createdAt));
}

export async function getWorkflow(email: string, id: string): Promise<Workflow | null> {
  const db = await getDb();
  const [row] = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.ownerEmail, email.toLowerCase()))).limit(1);
  return row ?? null;
}

/** Make sure every enabled recurring agent has its next eight weeks of slots on the calendar. */
export async function planCadences(email: string, now = new Date()) {
  const db = await getDb();
  const agents = (await listWorkflows(email)).filter((w) => w.enabled && w.cadence !== "none");
  for (const w of agents) {
    const dates = cadenceDates(w.cadence, now, 56);
    if (!dates.length) continue;
    await db
      .insert(calendarEntries)
      .values(dates.map((date) => ({ ownerEmail: email.toLowerCase(), title: w.name, notes: w.description, date, workflowId: w.id, personaId: w.personaId, origin: "cadence" as const })))
      .onConflictDoNothing();
  }
}

export async function calendarRange(email: string, from: string, to: string) {
  const db = await getDb();
  return db
    .select()
    .from(calendarEntries)
    .where(and(eq(calendarEntries.ownerEmail, email.toLowerCase()), gte(calendarEntries.date, from), sql`${calendarEntries.date} <= ${to}`))
    .orderBy(asc(calendarEntries.date), asc(calendarEntries.createdAt));
}

export async function founderJobs(email: string): Promise<Job[]> {
  const db = await getDb();
  return db.select().from(jobs).where(eq(jobs.founderEmail, email.toLowerCase())).orderBy(desc(jobs.createdAt));
}

export async function agentLog(jobIds: string[], limit = 40) {
  if (!jobIds.length) return [];
  const db = await getDb();
  return db.select().from(agentRuns).where(inArray(agentRuns.jobId, jobIds)).orderBy(desc(agentRuns.createdAt)).limit(limit);
}

/** Record what one agent did for an order. Idempotent on requestKey. */
export async function logAgent(jobId: string, role: AgentRole, requestKey: string, action: string, detail: string[] = [], simulated = false) {
  const db = await getDb();
  await db.insert(agentRuns).values({ jobId, role, requestKey, action, detail: detail.slice(0, 12), simulated }).onConflictDoNothing({ target: agentRuns.requestKey });
}

/* ── What the writer and editor know about this founder ─────────────────── */

export type StudioContext = {
  profile: Profile;
  persona: Persona | null;
  workflow: Workflow | null;
  memories: Memory[];
  guide: ReturnType<typeof effectiveGuide>;
};

export async function studioContext(job: Pick<Job, "founderEmail" | "personaId" | "workflowId">): Promise<StudioContext> {
  const profile = await getProfile(job.founderEmail);
  const mems = (await listMemories(job.founderEmail)).filter((m) => m.active);
  const workflow = job.workflowId ? await getWorkflow(job.founderEmail, job.workflowId) : null;
  const personaId = job.personaId ?? workflow?.personaId ?? null;
  const persona = personaId ? (profile.personas.find((p) => p.id === personaId) ?? null) : null;
  return { profile, persona, workflow, memories: mems, guide: effectiveGuide(profile.styleGuide ?? EMPTY_STYLE, mems) };
}

/** Knowledge items worth citing for this article: pinned ones, plus the most relevant others. */
export async function relevantKnowledge(job: Pick<Job, "founderEmail" | "topic" | "thesis" | "seedText">, limit = 6): Promise<KnowledgeItem[]> {
  const items = (await listKnowledge(job.founderEmail)).filter((k) => k.kind !== "sample");
  const kw = keywords(`${job.topic} ${job.thesis ?? ""} ${job.seedText.slice(0, 2000)}`);
  const scored = items.map((k) => ({ k, score: k.pinned ? 100 : [...keywords(`${k.title} ${k.content.slice(0, 3000)}`)].filter((w) => kw.has(w)).length }));
  return scored
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.k);
}

/* ── Idea Lab ──────────────────────────────────────────────────────────── */

export async function listPosts(email: string) {
  const db = await getDb();
  return db.select().from(socialPosts).where(eq(socialPosts.ownerEmail, email.toLowerCase())).orderBy(desc(socialPosts.postedAt), desc(socialPosts.createdAt)).limit(2000);
}

export async function listIdeas(email: string) {
  const db = await getDb();
  return db.select().from(ideas).where(eq(ideas.ownerEmail, email.toLowerCase())).orderBy(desc(ideas.updatedAt));
}

export async function getIdea(email: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(ideas).where(and(eq(ideas.id, id), eq(ideas.ownerEmail, email.toLowerCase()))).limit(1);
  return row ?? null;
}

export const todayYmd = () => ymd(new Date());
