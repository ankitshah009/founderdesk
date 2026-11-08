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

/** Platform-native versions of the announcement, written and approved per channel. */
export type ChannelVariants = { x?: string[]; xSingle?: string; linkedin?: string };

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
    revisionCycles: integer("revision_cycles").notNull().default(0),
    sourceSeq: integer("source_seq").notNull().default(0),
    imageCredits: integer("image_credits").notNull().default(0),
    imagesDeclined: boolean("images_declined").notNull().default(false),
    founderReplies: jsonb("founder_replies").$type<FounderReply[]>().notNull().default([]),
    openQuestions: jsonb("open_questions").$type<string[]>().notNull().default([]),
    destinations: jsonb("destinations").$type<string[]>().notNull().default(["web"]),
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
    kind: text("kind").$type<"founder_url" | "search_result" | "attachment" | "founder_note">().notNull(),
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
    author: text("author").$type<"writer" | "founder_edit">().notNull(),
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
