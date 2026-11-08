"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { CADENCES, KNOWLEDGE_KINDS, calendarEntries, drafts, jobs, knowledgeItems, memories, workflows, type Brand, type Cadence, type CalendarEntry, type KnowledgeKind, type Persona } from "@/lib/db/schema";
import { assertPublicUrl, htmlToText, pdfToText } from "@/lib/extract";
import { brandFromHtml, brandFromText, mergeBrand, type Capture } from "@/lib/studio/brand";
import { links } from "@/lib/links";
import { addDays, ymd } from "@/lib/studio/calendar";
import { CUSTOM_AGENT_TITLES, WORKFLOW_TEMPLATES } from "@/lib/studio/presets";
import { StudioAuthError, requireStudio } from "@/lib/studio/session";
import { addKnowledge, getProfile, getWorkflow, listKnowledge, planCadences, refreshVoice, remember, updateProfile } from "@/lib/studio/store";
import { parseTermLines } from "@/lib/studio/style";
import { createJob } from "@/lib/workflow/intake";
import { kick } from "@/lib/workflow/run";

export type StudioState = { error?: string; ok?: string } | null;

const MAX_UPLOAD = 15 * 1024 * 1024;
const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const lines = (raw: string) => raw.split("\n").map((l) => l.trim()).filter(Boolean);
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function fail(e: unknown): StudioState {
  if (e instanceof StudioAuthError) return { error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  return { error: msg || "Something went wrong. Try again." };
}

/** Fetch a founder-supplied URL safely (SSRF guard, timeout, size cap). */
async function safeFetch(raw: string): Promise<{ url: URL; type: string; bytes: Uint8Array }> {
  let url: URL;
  try {
    url = await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (e) {
    throw new Error(e instanceof TypeError ? "That doesn't look like a valid web address." : (e as Error).message);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": "FounderDeskStudio/1.0", accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(timeout ? `${url.hostname} took too long to respond.` : `Couldn't reach ${url.hostname}.`);
  }
  if (!res.ok) throw new Error(`${url.hostname} answered ${res.status}. Check the address, or paste the text instead.`);
  // Redirects can land somewhere else; re-check the final host.
  if (res.url) await assertPublicUrl(res.url);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD) throw new Error("That page is too large to read.");
  return { url, type: res.headers.get("content-type") ?? "", bytes: new Uint8Array(buf) };
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  try {
    return await pdfToText(bytes);
  } catch {
    throw new Error("We couldn't read that PDF. If it's a scanned image, paste the text instead.");
  }
}

/* ── Onboarding: brand capture ─────────────────────────────────────────── */

export async function captureBrand(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const url = str(form, "url");
    const text = str(form, "text");
    const file = form.get("file");
    const captures: Array<{ capture: Capture; source: string }> = [];

    if (url) {
      const page = await safeFetch(url);
      if (page.type.includes("pdf")) {
        const t = await readPdf(page.bytes);
        if (t.length < 40) throw new Error("That PDF had no readable text.");
        captures.push({ capture: brandFromText(t, page.url.toString()), source: page.url.toString() });
      } else {
        const html = new TextDecoder().decode(page.bytes);
        captures.push({ capture: brandFromHtml(html, page.url.toString()), source: page.url.toString() });
      }
    }

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD) throw new Error("That file is over 15 MB.");
      const name = file.name.toLowerCase();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let t: string;
      if (file.type.includes("pdf") || name.endsWith(".pdf")) t = await readPdf(bytes);
      else if (file.type.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) t = new TextDecoder().decode(bytes).slice(0, 200_000);
      else throw new Error("Upload a PDF, .txt or .md file.");
      if (t.trim().length < 40) throw new Error(`We couldn't find readable text in ${file.name}.`);
      captures.push({ capture: brandFromText(t, file.name), source: file.name });
    }

    if (text) {
      if (text.length < 40) throw new Error("Paste at least a couple of sentences about the company.");
      captures.push({ capture: brandFromText(text, "pasted text"), source: "pasted text" });
    }

    if (!captures.length) return { error: "Add a website, a file or some text to capture from." };

    const profile = await getProfile(email);
    let brand: Brand | null = profile.brand;
    for (const c of captures) brand = mergeBrand(brand, c.capture.brand, c.source);
    await updateProfile(email, { brand });

    const existing = await listKnowledge(email);
    const titles = new Set(existing.map((k) => k.title.toLowerCase()));
    const fresh = captures.flatMap((c) => c.capture.knowledge).filter((k) => {
      const key = k.title.slice(0, 200).toLowerCase();
      if (titles.has(key)) return false;
      titles.add(key);
      return true;
    });
    await addKnowledge(email, fresh);

    let seeded = false;
    const copy = captures.map((c) => c.capture.copy).join("\n\n").trim();
    if (!profile.voice && wordCount(copy) >= 80 && !titles.has("company website copy")) {
      await addKnowledge(email, [{ kind: "sample", title: "Company website copy", content: copy }]);
      seeded = true;
    }

    refresh();
    const parts = [`Captured from ${captures.map((c) => c.source).join(", ")}`];
    if (fresh.length) parts.push(`${fresh.length} knowledge item${fresh.length === 1 ? "" : "s"} added`);
    if (seeded) parts.push("a first voice profile learned from your copy");
    return { ok: `${parts.join("; ")}.` };
  } catch (e) {
    return fail(e);
  }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export async function saveBrand(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const profile = await getProfile(email);
    const orNull = (k: string) => str(form, k) || null;
    const logoUrl = orNull("logoUrl");
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) return { error: "The logo must be an http(s) image address." };
    const website = orNull("website");
    if (website && !/^https?:\/\//i.test(website)) return { error: "The website must start with http:// or https://." };
    const colors = str(form, "colors").split(/[\s,]+/).filter(Boolean);
    const bad = colors.find((c) => !HEX.test(c));
    if (bad) return { error: `"${bad}" isn't a hex colour like #ff5a1f.` };
    const brand: Brand = {
      name: orNull("name"),
      tagline: orNull("tagline"),
      description: orNull("description"),
      website,
      logoUrl,
      colors: colors.slice(0, 5),
      audience: orNull("audience"),
      products: lines(str(form, "products")).slice(0, 8),
      keywords: str(form, "keywords").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
      sources: profile.brand?.sources ?? ["edited by you"],
      capturedAt: profile.brand?.capturedAt ?? new Date().toISOString(),
    };
    await updateProfile(email, { brand });
    refresh();
    return { ok: "Brand saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function finishOnboarding(form?: FormData): Promise<void> {
  const { email } = await requireStudio();
  const { safeNext } = await import("@/lib/auth-google");
  const next = safeNext(form ? String(form.get("next") ?? "") : "");
  // Optional: finishing or skipping both count; founders share as much as they like.
  await updateProfile(email, { onboardedAt: new Date() });
  redirect(next);
}

/* ── Voice: writing samples ────────────────────────────────────────────── */

export async function addSample(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const url = str(form, "url");
    let content = str(form, "text");
    let title = str(form, "title");
    let source: string | null = null;
    if (url) {
      const page = await safeFetch(url);
      if (page.type.includes("pdf")) content = await readPdf(page.bytes);
      else {
        const html = new TextDecoder().decode(page.bytes);
        const parsed = /<html|<body|<p[\s>]/i.test(html) ? htmlToText(html) : { title: null, text: html };
        content = parsed.text;
        title ||= parsed.title ?? "";
      }
      source = page.url.toString();
      title ||= page.url.hostname + page.url.pathname;
    }
    if (!content.trim()) return { error: "Paste some of your writing, or a link to it." };
    await addKnowledge(email, [{ kind: "sample", title: title || `Writing sample (${new Date().toLocaleDateString("en-US")})`, content, url: source }]);
    refresh();
    return { ok: "Sample added. Your voice profile was re-learned." };
  } catch (e) {
    return fail(e);
  }
}

/* ── Style guide & personas ────────────────────────────────────────────── */

export async function saveStyle(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    await updateProfile(email, {
      styleGuide: {
        tone: str(form, "tone").slice(0, 400),
        preferredTerms: parseTermLines(str(form, "terms")),
        bannedPhrases: lines(str(form, "banned")).slice(0, 100),
        formatting: lines(str(form, "formatting")).slice(0, 30),
      },
    });
    refresh();
    return { ok: "Style guide saved. The Editor applies it to every article." };
  } catch (e) {
    return fail(e);
  }
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export async function savePersona(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const name = str(form, "name");
    const id = slug(name);
    if (!id) return { error: "Give the persona a name." };
    const original = str(form, "originalId");
    const persona: Persona = { id, name, description: str(form, "description"), cares: str(form, "cares"), avoid: str(form, "avoid") };
    const { personas } = await getProfile(email);
    if (personas.some((p) => p.id === id && p.id !== original)) return { error: `You already have a persona called ${name}.` };
    const next = original && personas.some((p) => p.id === original) ? personas.map((p) => (p.id === original ? persona : p)) : [...personas, persona];
    await updateProfile(email, { personas: next.slice(0, 20) });
    refresh();
    return { ok: original ? "Persona updated." : "Persona added." };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePersona(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const id = str(form, "id");
  const { personas } = await getProfile(email);
  await updateProfile(email, { personas: personas.filter((p) => p.id !== id) });
  refresh();
}

/* ── Knowledge base ────────────────────────────────────────────────────── */

export async function addKnowledgeItem(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const kind = str(form, "kind") as KnowledgeKind;
    if (!KNOWLEDGE_KINDS.includes(kind) || kind === "sample") return { error: "Pick what kind of knowledge this is." };
    const title = str(form, "title");
    const content = str(form, "content");
    const url = str(form, "url") || null;
    if (!title) return { error: "Add a title." };
    if (content.length < 10) return { error: "Add the content the desk should know." };
    if (url && !/^https?:\/\//i.test(url)) return { error: "The URL must start with http:// or https://." };
    await addKnowledge(email, [{ kind, title, content, url, pinned: form.get("pinned") === "on" }]);
    refresh();
    return { ok: "Added to your knowledge base." };
  } catch (e) {
    return fail(e);
  }
}

export async function togglePin(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  const id = str(form, "id");
  const [row] = await db.select().from(knowledgeItems).where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.ownerEmail, email.toLowerCase()))).limit(1);
  if (!row) return;
  await db.update(knowledgeItems).set({ pinned: !row.pinned, updatedAt: new Date() }).where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.ownerEmail, email.toLowerCase())));
  refresh();
}

export async function deleteKnowledge(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  const [row] = await db
    .delete(knowledgeItems)
    .where(and(eq(knowledgeItems.id, str(form, "id")), eq(knowledgeItems.ownerEmail, email.toLowerCase())))
    .returning({ kind: knowledgeItems.kind });
  if (row?.kind === "sample") await refreshVoice(email);
  refresh();
}

/* ── Editorial memory ──────────────────────────────────────────────────── */

export async function addMemory(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const text = str(form, "text");
    if (text.length < 3) return { error: "Write the rule you want remembered." };
    const row = await remember(email, { kind: "preference", text, origin: "manual" });
    refresh();
    return row ? { ok: "Remembered. The Editor applies it from the next article." } : { error: "That rule is already in your memory." };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleMemory(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  const id = str(form, "id");
  const where = and(eq(memories.id, id), eq(memories.ownerEmail, email.toLowerCase()));
  const [row] = await db.select({ active: memories.active }).from(memories).where(where).limit(1);
  if (!row) return;
  await db.update(memories).set({ active: !row.active }).where(where);
  refresh();
}

export async function deleteMemory(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  await db.delete(memories).where(and(eq(memories.id, str(form, "id")), eq(memories.ownerEmail, email.toLowerCase())));
  refresh();
}

/* ── Starting articles from the Studio ─────────────────────────────────── */

async function startJob(email: string, args: { subject: string; body: string; workflowId?: string | null; personaId?: string | null }) {
  const profile = await getProfile(email);
  let body = args.body.trim();
  if (body.length < 40) body = `Write an article titled "${args.subject}". Draw on my knowledge base, voice profile and style guide.\n\n${body}`;
  const job = await createJob({ channel: "web", founderEmail: email, founderName: profile.displayName, subject: args.subject, body });
  const db = await getDb();
  await db.update(jobs).set({ workflowId: args.workflowId ?? null, personaId: args.personaId ?? null, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  // First article free per account (the account is a verified email).
  const { claimFree } = await import("@/lib/workflow/intake");
  await claimFree(job.id);
  kick();
  return job;
}

const workflowBody = (w: { instructions: string; sections: string[] }, extra = "") =>
  [extra, w.instructions, w.sections.length ? `Sections: ${w.sections.join(" · ")}` : ""].filter(Boolean).join("\n\n");

/* ── Custom agents & workflows ─────────────────────────────────────────── */

async function ownPersona(email: string, id: string) {
  if (!id) return null;
  const { personas } = await getProfile(email);
  return personas.some((p) => p.id === id) ? id : null;
}

export async function saveWorkflow(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const id = str(form, "id");
    const name = str(form, "name").slice(0, 120);
    if (!name) return { error: "Give it a name." };
    const kind = str(form, "kind") === "agent" ? "agent" : "format";
    const cadenceRaw = str(form, "cadence") as Cadence;
    const cadence: Cadence = CADENCES.includes(cadenceRaw) ? cadenceRaw : "none";
    const values = {
      name,
      kind: kind as "agent" | "format",
      agentTitle: kind === "agent" ? str(form, "agentTitle").slice(0, 80) || CUSTOM_AGENT_TITLES[0] : null,
      description: str(form, "description").slice(0, 500),
      instructions: str(form, "instructions").slice(0, 4000),
      sections: lines(str(form, "sections")).slice(0, 12),
      personaId: await ownPersona(email, str(form, "personaId")),
      channels: form.getAll("channels").map(String).filter((c) => ["web", "x", "linkedin", "newsletter", "instagram"].includes(c)),
      cadence: kind === "agent" ? cadence : ("none" as Cadence),
      updatedAt: new Date(),
    };
    const db = await getDb();
    if (id) {
      const [row] = await db.update(workflows).set(values).where(and(eq(workflows.id, id), eq(workflows.ownerEmail, email.toLowerCase()))).returning({ id: workflows.id });
      if (!row) return { error: "That workflow no longer exists." };
    } else {
      await db.insert(workflows).values({ ...values, ownerEmail: email.toLowerCase() });
    }
    await planCadences(email);
    refresh();
    return { ok: id ? "Saved." : `${name} created.` };
  } catch (e) {
    return fail(e);
  }
}

export async function createFromTemplate(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const t = WORKFLOW_TEMPLATES[Number(str(form, "index"))];
  if (!t) return;
  const db = await getDb();
  await db.insert(workflows).values({
    ownerEmail: email.toLowerCase(),
    name: t.name,
    kind: t.kind,
    agentTitle: t.agentTitle ?? null,
    description: t.description,
    instructions: t.instructions,
    sections: t.sections,
    personaId: t.personaId ? await ownPersona(email, t.personaId) : null,
    channels: t.channels,
    cadence: t.cadence,
  });
  await planCadences(email);
  refresh();
}

export async function toggleWorkflow(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const w = await getWorkflow(email, str(form, "id"));
  if (!w) return;
  const db = await getDb();
  await db.update(workflows).set({ enabled: !w.enabled, updatedAt: new Date() }).where(and(eq(workflows.id, w.id), eq(workflows.ownerEmail, email.toLowerCase())));
  await planCadences(email);
  refresh();
}

export async function deleteWorkflow(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  await db.delete(workflows).where(and(eq(workflows.id, str(form, "id")), eq(workflows.ownerEmail, email.toLowerCase())));
  await planCadences(email);
  refresh();
}

export async function runWorkflow(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const w = await getWorkflow(email, str(form, "id"));
  if (!w) return;
  const job = await startJob(email, { subject: w.name, body: workflowBody(w, w.description), workflowId: w.id, personaId: w.personaId });
  redirect(links.orderPath(job.id));
}

/* ── Editorial calendar ────────────────────────────────────────────────── */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function ownEntry(email: string, id: string): Promise<CalendarEntry | null> {
  const db = await getDb();
  const [row] = await db.select().from(calendarEntries).where(and(eq(calendarEntries.id, id), eq(calendarEntries.ownerEmail, email.toLowerCase()))).limit(1);
  return row ?? null;
}

export async function addCalendarEntry(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const title = str(form, "title").slice(0, 200);
    const date = str(form, "date");
    if (!title) return { error: "Give the entry a title." };
    if (!YMD.test(date)) return { error: "Pick a date." };
    const wid = str(form, "workflowId");
    const workflow = wid ? await getWorkflow(email, wid) : null;
    const db = await getDb();
    const values = {
      ownerEmail: email.toLowerCase(),
      title,
      date,
      notes: str(form, "notes").slice(0, 2000),
      personaId: (await ownPersona(email, str(form, "personaId"))) ?? workflow?.personaId ?? null,
      origin: "founder" as const,
    };
    try {
      await db.insert(calendarEntries).values({ ...values, workflowId: workflow?.id ?? null });
    } catch (e) {
      // That workflow already has a slot on this day (one per day per workflow).
      if (!workflow) throw e;
      return { error: `${workflow.name} already has an entry on ${date}. Pick another day.` };
    }
    refresh();
    return { ok: "Added to your calendar." };
  } catch (e) {
    return fail(e);
  }
}

/** One-click planning from Insights: a topic suggestion or a refresh. */
export async function planTopic(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const raw = str(form, "origin");
  const origin: CalendarEntry["origin"] = raw === "performance" ? "performance" : raw === "refresh" ? "refresh" : "founder";
  const title = str(form, "title").slice(0, 200);
  if (!title) return;
  const db = await getDb();
  await db.insert(calendarEntries).values({ ownerEmail: email.toLowerCase(), title, notes: str(form, "notes").slice(0, 2000), date: ymd(addDays(new Date(), 7)), origin });
  refresh();
}

export async function startEntry(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const entry = await ownEntry(email, str(form, "id"));
  if (!entry) return;
  const workflow = entry.workflowId ? await getWorkflow(email, entry.workflowId) : null;
  const body = workflow ? workflowBody(workflow, [entry.title, entry.notes].filter(Boolean).join("\n\n")) : [entry.title, entry.notes].filter(Boolean).join("\n\n");
  const job = await startJob(email, { subject: entry.title, body, workflowId: workflow?.id ?? null, personaId: entry.personaId ?? workflow?.personaId ?? null });
  const db = await getDb();
  await db.update(calendarEntries).set({ status: "ordered", jobId: job.id }).where(and(eq(calendarEntries.id, entry.id), eq(calendarEntries.ownerEmail, email.toLowerCase())));
  redirect(links.orderPath(job.id));
}

export async function skipEntry(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const entry = await ownEntry(email, str(form, "id"));
  if (!entry) return;
  const db = await getDb();
  await db.update(calendarEntries).set({ status: entry.status === "skipped" ? "planned" : "skipped" }).where(eq(calendarEntries.id, entry.id));
  refresh();
}

export async function moveEntry(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const entry = await ownEntry(email, str(form, "id"));
  const date = str(form, "date");
  if (!entry || !YMD.test(date)) return;
  const db = await getDb();
  try {
    await db.update(calendarEntries).set({ date }).where(eq(calendarEntries.id, entry.id));
  } catch {
    // A recurring agent already has a slot that day; leave it where it was.
  }
  refresh();
}

export async function deleteEntry(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  await db.delete(calendarEntries).where(and(eq(calendarEntries.id, str(form, "id")), eq(calendarEntries.ownerEmail, email.toLowerCase())));
  refresh();
}

/* ── Articles ──────────────────────────────────────────────────────────── */

export async function adaptForPersona(form: FormData): Promise<void> {
  const { email } = await requireStudio();
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, str(form, "jobId")), eq(jobs.founderEmail, email.toLowerCase()))).limit(1);
  if (!job) return;
  const { personas } = await getProfile(email);
  const persona = personas.find((p) => p.id === str(form, "personaId"));
  if (!persona) return;
  const [draft] = await db.select().from(drafts).where(eq(drafts.jobId, job.id)).orderBy(desc(drafts.version)).limit(1);
  const source = draft ? `# ${draft.title}\n\n${draft.bodyMarkdown}` : job.seedText;
  const next = await startJob(email, {
    subject: `${draft?.title ?? job.topic} (for ${persona.name})`,
    body: `Adapt this article for ${persona.name} (${persona.description}).\n\n${source}`,
    workflowId: job.workflowId,
    personaId: persona.id,
  });
  redirect(links.orderPath(next.id));
}

/* ── Setup helpers: starter voices and persona confirmation ─────────────── */

export async function addStarterSample(_: StudioState, form: FormData): Promise<StudioState> {
  try {
    const { email } = await requireStudio();
    const { STARTER_VOICES } = await import("@/lib/studio/presets");
    const v = STARTER_VOICES.find((x) => x.id === str(form, "starter"));
    if (!v) return { error: "Pick one of the starter voices." };
    const existing = await listKnowledge(email);
    if (existing.some((k) => k.kind === "sample" && k.title === `Starter voice: ${v.name}`)) return { ok: `${v.name} is already in your samples.` };
    await addKnowledge(email, [{ kind: "sample", title: `Starter voice: ${v.name}`, content: v.sample }]);
    refresh();
    return { ok: `Added the ${v.name.toLowerCase()} starter. Replace it with your own writing any time.` };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmPersonas(): Promise<void> {
  const { email } = await requireStudio();
  const profile = await getProfile(email);
  await updateProfile(email, { setup: { ...profile.setup, personasConfirmed: true } });
  refresh();
}
