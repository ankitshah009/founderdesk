import { sql } from "drizzle-orm";
import {
  customType,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Neon is the record of what actually happened. Agent conversations are never
 * the source of truth: every stage transition, provider event, dispatch and
 * outbound message is persisted here first, then acted on.
 */

export const JOB_STAGES = [
  "AWAITING_PAYMENT",
  "PAID",
  "RESEARCHING",
  "WRITING",
  "REVIEWING",
  "WAITING_FOR_FOUNDER",
  "READY_FOR_APPROVAL",
  "PUBLISHING",
  "PUBLISHED",
  "COMPLETE",
  "UNABLE_TO_COMPLETE",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const REVIEW_OUTCOMES = [
  "READY_FOR_APPROVAL",
  "NEEDS_REVISION",
  "NEEDS_FOUNDER_INPUT",
  "UNABLE_TO_COMPLETE",
] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export type FounderReply = {
  messageId: string | null;
  text: string;
  receivedAt: string;
  attachmentSourceIds: string[];
};

export type Finding = {
  id: string;
  severity: "blocking" | "minor";
  kind: string;
  claim: string;
  passage?: string;
  sourceId?: string;
  proposedFix?: string;
  question?: string;
  resolved?: boolean;
};

export type Claim = { text: string; sourceIds: string[] };

export type QualityScores = {
  overall: number;
  accuracy: number;
  sources: number;
  originality: number;
  /** Null when the founder has no voice profile to compare against. */
  voice: number | null;
  readability: number;
  search: number;
  suggestions: string[];
};

/** Platform-native versions of the announcement, written and approved per channel. */
export type ChannelVariants = {
  x?: string[];
  xSingle?: string;
  linkedin?: string;
  newsletter?: { subject: string; preview: string; body: string };
  instagram?: { slides: string[]; caption: string };
};

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").$type<"email" | "web" | "mcp">().notNull(),
    founderEmail: text("founder_email").notNull(),
    founderName: text("founder_name"),
    inboxId: text("inbox_id"),
    threadId: text("thread_id"),
    firstMessageId: text("first_message_id"),
    lastMessageId: text("last_message_id"),
    topic: text("topic").notNull(),
    audience: text("audience"),
    thesis: text("thesis"),
    seedText: text("seed_text").notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull().default([]),
    boundaries: jsonb("boundaries").$type<string[]>().notNull().default([]),
    privateTerms: jsonb("private_terms").$type<string[]>().notNull().default([]),
    stage: text("stage").$type<JobStage>().notNull().default("AWAITING_PAYMENT"),
    stageReason: text("stage_reason"),
    paymentStatus: text("payment_status").$type<"unpaid" | "paid">().notNull().default("unpaid"),
    amountCents: integer("amount_cents").notNull().default(900),
    currency: text("currency").notNull().default("usd"),
    checkoutSessionId: text("checkout_session_id"),
    checkoutUrl: text("checkout_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Founder-chosen publish time; null means publish on approval. */
    publishAt: timestamp("publish_at", { withTimezone: true }),
    revisionCycles: integer("revision_cycles").notNull().default(0),
    sourceSeq: integer("source_seq").notNull().default(0),
    imageCredits: integer("image_credits").notNull().default(0),
    imagesDeclined: boolean("images_declined").notNull().default(false),
    founderReplies: jsonb("founder_replies").$type<FounderReply[]>().notNull().default([]),
    openQuestions: jsonb("open_questions").$type<string[]>().notNull().default([]),
    destinations: jsonb("destinations").$type<string[]>().notNull().default(["web"]),
    /** Studio: the audience persona and saved workflow this article was written for. */
    personaId: text("persona_id"),
    workflowId: uuid("workflow_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_thread_idx").on(t.threadId),
    uniqueIndex("jobs_checkout_idx").on(t.checkoutSessionId),
    // One free first article per email address, enforced by the database.
    uniqueIndex("jobs_free_first_idx").on(t.founderEmail).where(sql`${t.paymentStatus} = 'paid' and ${t.amountCents} = 0`),
    index("jobs_stage_idx").on(t.stage),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(), // short stable label used in prompts and citations: S1, S2…
    kind: text("kind").$type<"founder_url" | "search_result" | "attachment" | "founder_note" | "knowledge">().notNull(),
    url: text("url"),
    title: text("title"),
    snippet: text("snippet"),
    content: text("content"),
    publishedDate: text("published_date"),
    contentHash: text("content_hash"),
    provider: text("provider"),
    status: text("status").$type<"pending" | "fetched" | "empty" | "failed">().notNull().default("pending"),
    error: text("error"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sources_job_ref_idx").on(t.jobId, t.ref), index("sources_job_idx").on(t.jobId)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
    passage: text("passage").notNull(),
    supports: text("supports").notNull(),
    kind: text("kind").$type<"supporting" | "limitation" | "contradiction">().notNull().default("supporting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evidence_job_idx").on(t.jobId)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    author: text("author").$type<"writer" | "founder_edit" | "ai_edit">().notNull(),
    title: text("title").notNull(),
    dek: text("dek").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    announcement: text("announcement").notNull(),
    claims: jsonb("claims").$type<Claim[]>().notNull().default([]),
    corrections: jsonb("corrections").$type<string[]>().notNull().default([]),
    variants: jsonb("variants").$type<ChannelVariants>().notNull().default({}),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("drafts_job_version_idx").on(t.jobId, t.version)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    outcome: text("outcome").$type<ReviewOutcome>().notNull(),
    summary: text("summary").notNull(),
    findings: jsonb("findings").$type<Finding[]>().notNull().default([]),
    founderQuestions: jsonb("founder_questions").$type<string[]>().notNull().default([]),
    /** Quality score of the reviewed draft, computed by the app (see lib/studio/quality). */
    scores: jsonb("scores").$type<QualityScores | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_job_idx").on(t.jobId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    destination: text("destination").notNull(),
    action: text("action").$type<"publish">().notNull(),
    /** Destination-specific choice made at approval, e.g. X "single" or "thread". */
    option: text("option"),
    /** Images the founder chose at approval, in display order, and a hash of their bytes. */
    imageIds: jsonb("image_ids").$type<string[]>().notNull().default([]),
    imagesHash: text("images_hash"),
    /** When the founder approved publication for; part of what was approved. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("approvals_draft_dest_idx").on(t.draftId, t.destination)],
);

export type Verification = {
  ok: boolean;
  checkedAt: string;
  httpStatus?: number;
  detail: string;
};

export type MobileCheck = {
  mode: "device" | "http-fallback";
  status: "pending" | "running" | "passed" | "issues" | "failed";
  taskId?: string;
  headlineVisible?: boolean;
  scrolledToEnd?: boolean;
  sourceLinksPresent?: boolean;
  layoutProblems?: string[];
  message?: string;
  recordingId?: string | null;
  checkedAt?: string;
};

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").notNull().references(() => drafts.id),
    approvalId: uuid("approval_id").notNull().references(() => approvals.id),
    destination: text("destination").notNull(),
    slug: text("slug"),
    url: text("url"),
    externalId: text("external_id"),
    contentHash: text("content_hash").notNull(),
    status: text("status").$type<"publishing" | "published" | "verify_failed" | "failed">().notNull(),
    verification: jsonb("verification").$type<Verification | null>(),
    mobileCheck: jsonb("mobile_check").$type<MobileCheck | null>(),
    views: integer("views").notNull().default(0),
    reads: integer("reads").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publications_job_dest_idx").on(t.jobId, t.destination),
    uniqueIndex("publications_slug_idx").on(t.slug),
  ],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").$type<"stripe" | "agentmail" | "simulator">().notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: text("status").$type<"received" | "processed" | "ignored" | "failed">().notNull().default("received"),
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("provider_events_ext_idx").on(t.provider, t.externalId)],
);

export const DISPATCH_KINDS = [
  "research_plan",
  "source_search",
  "source_fetch",
  "research_synthesis",
  "write",
  "review",
  "publish",
  "mobile_check",
  "image",
  "revise_selection",
] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DispatchKind>().notNull(),
    requestKey: text("request_key").notNull(),
    status: text("status").$type<"pending" | "started" | "succeeded" | "failed" | "cancelled">().notNull().default("pending"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    simulated: boolean("simulated").notNull().default(false),
    /** What this unit of work cost at the provider, in micro-USD. */
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dispatches_request_key_idx").on(t.requestKey),
    index("dispatches_runnable_idx").on(t.status, t.nextRunAt),
    index("dispatches_job_idx").on(t.jobId),
  ],
);

export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind")
      .$type<"acknowledgement" | "payment_received" | "question" | "review_link" | "published" | "still_waiting">()
      .notNull(),
    requestKey: text("request_key").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    inReplyTo: text("in_reply_to"),
    state: text("state").$type<"pending" | "sent" | "simulated" | "failed">().notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("outbound_request_key_idx").on(t.requestKey), index("outbound_job_idx").on(t.jobId)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Publication = typeof publications.$inferSelect;
export type Dispatch = typeof dispatches.$inferSelect;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type ProviderEvent = typeof providerEvents.$inferSelect;

/* ── Authentication ─────────────────────────────────────────────────────────
 * Server-side sessions and single-use sign-in challenges. Only hashes of
 * secrets are stored; the raw session token lives in an HttpOnly cookie and
 * the raw link token / code only in the email.
 */

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    linkTokenHash: text("link_token_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** Where to land after this challenge, and sign-up details saved only once it is verified. */
    next: text("next"),
    meta: jsonb("meta").$type<{ name?: string; website?: string }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_challenges_email_idx").on(t.email, t.createdAt), index("auth_challenges_ip_idx").on(t.ipHash, t.createdAt)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("auth_sessions_token_idx").on(t.tokenHash), index("auth_sessions_email_idx").on(t.email)],
);

export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    email: text("email"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_events_email_idx").on(t.email, t.createdAt)],
);

/* ── Images add-on ─────────────────────────────────────────────────────────── */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** One row per paid image pack; the unique session id makes grants idempotent. */
export const imageCreditGrants = pgTable("image_credit_grants", {
  checkoutSessionId: text("checkout_session_id").primaryKey(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(), // "hero" or the section heading it illustrates
    prompt: text("prompt").notNull(),
    status: text("status").$type<"generating" | "ready" | "failed">().notNull().default("generating"),
    mime: text("mime"),
    data: bytea("data"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("images_job_idx").on(t.jobId)],
);

export type ImageRow = typeof images.$inferSelect;

/* ── Studio: the founder's workspace ─────────────────────────────────────────
 * Everything that persists across articles for one founder (keyed by email,
 * the same identity the passwordless session proves): their voice, style
 * guide, personas, knowledge base, editorial memory, saved workflows and
 * custom agents, and the editorial calendar.
 */

export type VoiceProfile = {
  sampleCount: number;
  words: number;
  avgSentenceLength: number;
  sentenceLengthSpread: number;
  contractionRate: number;
  firstPersonRate: number;
  questionRate: number;
  exclamationRate: number;
  readingEase: number;
  signaturePhrases: string[];
  traits: string[];
  analyzedAt: string;
};

export type StyleGuide = {
  /** "use" replaces every phrase in "insteadOf". */
  preferredTerms: Array<{ use: string; insteadOf: string[] }>;
  bannedPhrases: string[];
  tone: string;
  formatting: string[];
};

export type Persona = {
  id: string;
  name: string;
  /** Who they are, in the founder's words: written into the brief as the audience. */
  description: string;
  cares: string;
  avoid: string;
};

export type Brand = {
  name: string | null;
  tagline: string | null;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  colors: string[];
  audience: string | null;
  products: string[];
  keywords: string[];
  /** Where the brand was read from: a URL, a file name, or "pasted text". */
  sources: string[];
  capturedAt: string;
};

export const profiles = pgTable("profiles", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  company: text("company"),
  brand: jsonb("brand").$type<Brand | null>(),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** Setup steps the founder confirmed explicitly (e.g. kept the default personas). */
  setup: jsonb("setup").$type<{ personasConfirmed?: boolean; tourSeen?: boolean }>().notNull().default({}),
  voice: jsonb("voice").$type<VoiceProfile | null>(),
  styleGuide: jsonb("style_guide").$type<StyleGuide>().notNull().default({ preferredTerms: [], bannedPhrases: [], tone: "", formatting: [] }),
  personas: jsonb("personas").$type<Persona[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const KNOWLEDGE_KINDS = ["company", "product", "opinion", "article", "source", "sample"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    kind: text("kind").$type<KnowledgeKind>().notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    /** Pinned items go into every article's research, not only when relevant. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_owner_idx").on(t.ownerEmail, t.kind)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    kind: text("kind").$type<"preference" | "fact" | "correction">().notNull(),
    text: text("text").notNull(),
    origin: text("origin").$type<"edit_request" | "founder_reply" | "manual">().notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_owner_idx").on(t.ownerEmail)],
);

export const CADENCES = ["none", "weekly", "biweekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    /** "format": a reusable article shape. "agent": a recurring custom agent that owns a format. */
    kind: text("kind").$type<"format" | "agent">().notNull(),
    agentTitle: text("agent_title"),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    sections: jsonb("sections").$type<string[]>().notNull().default([]),
    personaId: text("persona_id"),
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    cadence: text("cadence").$type<Cadence>().notNull().default("none"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workflows_owner_idx").on(t.ownerEmail)],
);

export const calendarEntries = pgTable(
  "calendar_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    /** Planned publish day, YYYY-MM-DD. */
    date: text("date").notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "cascade" }),
    personaId: text("persona_id"),
    status: text("status").$type<"planned" | "ordered" | "published" | "skipped">().notNull().default("planned"),
    origin: text("origin").$type<"founder" | "cadence" | "performance" | "refresh">().notNull().default("founder"),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_owner_idx").on(t.ownerEmail, t.date),
    // A recurring agent plans each slot once.
    uniqueIndex("calendar_workflow_date_idx").on(t.workflowId, t.date).where(sql`${t.workflowId} is not null`),
  ],
);

export const AGENT_ROLES = ["researcher", "writer", "editor", "fact_checker", "reviewer"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** What each agent on the desk did for an order — the orchestration log. */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    role: text("role").$type<AgentRole>().notNull(),
    /** Stable per unit of work, so a re-applied dispatch never logs twice. */
    requestKey: text("request_key").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<string[]>().notNull().default([]),
    simulated: boolean("simulated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_runs_key_idx").on(t.requestKey), index("agent_runs_job_idx").on(t.jobId, t.createdAt)],
);

/** Highlight-and-ask: a founder's instruction about one passage of a draft. */
export const editRequests = pgTable(
  "edit_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    selection: text("selection").notNull(),
    instruction: text("instruction").notNull(),
    status: text("status").$type<"pending" | "applied" | "failed" | "superseded">().notNull().default("pending"),
    resultDraftId: uuid("result_draft_id").references(() => drafts.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("edit_requests_job_idx").on(t.jobId)],
);

/** Daily reader counts for a published article (first-party, counted by our own page). */
export const articleDaily = pgTable(
  "article_daily",
  {
    publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    views: integer("views").notNull().default(0),
    reads: integer("reads").notNull().default(0),
  },
  (t) => [uniqueIndex("article_daily_pk").on(t.publicationId, t.day)],
);

export type Profile = typeof profiles.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type CalendarEntry = typeof calendarEntries.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type EditRequest = typeof editRequests.$inferSelect;

/* ── Social accounts (per founder) ──────────────────────────────────────────
 * OAuth connections the founder makes from the Studio. Tokens are encrypted
 * at rest (AES-256-GCM, key derived from APP_SECRET). "simulated" accounts
 * exist only where the provider's OAuth app is not configured; posting through
 * them is recorded and labelled, never sent.
 */

export const SOCIAL_PROVIDERS = ["x", "linkedin", "instagram"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    provider: text("provider").$type<SocialProvider>().notNull(),
    externalUserId: text("external_user_id").notNull(),
    handle: text("handle").notNull(),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    /** How posts reach this account: the platform API (OAuth) or the app signed in on the Mobile Run phone. */
    via: text("via").$type<"oauth" | "mobilerun">().notNull().default("oauth"),
    simulated: boolean("simulated").notNull().default(false),
    /** Preselect this account at approval, so approved articles are announced without another step. */
    autoPost: boolean("auto_post").notNull().default(true),
    status: text("status").$type<"connected" | "expired" | "revoked">().notNull().default("connected"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_accounts_owner_provider_idx").on(t.ownerEmail, t.provider)],
);

/* ── Idea Lab: the founder's post history and swipe file ─────────────────── */

export const POST_PLATFORMS = ["x", "linkedin", "instagram", "tiktok", "newsletter", "blog", "other"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    /** "me" for the founder's own posts; otherwise the creator's handle (swipe file). */
    author: text("author").notNull(),
    platform: text("platform").$type<PostPlatform>().notNull(),
    url: text("url"),
    text: text("text").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    impressions: integer("impressions"),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    /** Account size when posted, for normalising engagement across creators. */
    followers: integer("followers"),
    capturedVia: text("captured_via").$type<"manual" | "csv" | "bookmarklet" | "x_api" | "published">().notNull().default("manual"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("social_posts_owner_idx").on(t.ownerEmail, t.author), uniqueIndex("social_posts_ext_idx").on(t.ownerEmail, t.platform, t.externalId)],
);

export const ideas = pgTable(
  "ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmail: text("owner_email").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    platform: text("platform").$type<PostPlatform>().notNull().default("linkedin"),
    hooks: jsonb("hooks").$type<string[]>().notNull().default([]),
    status: text("status").$type<"exploring" | "planned" | "ordered" | "archived">().notNull().default("exploring"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ideas_owner_idx").on(t.ownerEmail)],
);

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type SocialPost = typeof socialPosts.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
