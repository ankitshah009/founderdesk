import { z } from "zod";

/**
 * All configuration is read here, once. Every integration is either `live`
 * (credentials present, real API calls) or `simulated` (no credentials, a
 * local stand-in that is labelled as such everywhere it surfaces). Nothing is
 * ever silently faked: simulated work is recorded with `simulated: true`.
 */

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: optional,
  DESK_TOKEN: optional,
  MCP_API_KEY: optional,

  DATABASE_URL: optional,
  PGLITE_DIR: optional,

  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_ID: optional,
  OFFER_AMOUNT_CENTS: z.coerce.number().int().positive().default(900),

  AGENTMAIL_API_KEY: optional,
  AGENTMAIL_INBOX_ID: optional,
  AGENTMAIL_WEBHOOK_SECRET: optional,
  AGENTMAIL_BASE_URL: z.string().url().default("https://api.agentmail.to/v0"),

  NAIVE_API_KEY: optional,
  NAIVE_BASE_URL: z.string().url().default("https://api.vetta.sh/v1"),
  NAIVE_MODEL: z.string().default("vetta/auto"),
  NAIVE_SESSION_BUDGET_MICRO_USD: z.coerce.number().int().positive().default(700_000),

  MONID_API_KEY: optional,
  MONID_BASE_URL: z.string().url().default("https://api.monid.ai/v1"),
  MONID_SEARCH_PROVIDER: optional,
  MONID_SEARCH_ENDPOINT: optional,
  MONID_SEARCH_INPUT: z.string().default('{"query":"{{query}}","numResults":5}'),
  MONID_FETCH_PROVIDER: optional,
  MONID_FETCH_ENDPOINT: optional,
  MONID_FETCH_INPUT: z.string().default('{"url":"{{url}}"}'),
  RESEARCH_MAX_SEARCHES: z.coerce.number().int().min(0).max(20).default(8),
  RESEARCH_MAX_FETCHES: z.coerce.number().int().min(0).max(20).default(8),

  OPENAI_API_KEY: optional,
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-4.1"),

  MOBILERUN_API_KEY: optional,
  MOBILERUN_BASE_URL: z.string().url().default("https://api.mobilerun.ai/v1"),
  MOBILERUN_DEVICE_ID: optional,
  /** Set to "true" once Instagram is signed in on the Mobile Run device. */
  INSTAGRAM_VIA_MOBILERUN: optional,

  X_USER_ACCESS_TOKEN: optional,
  LINKEDIN_ACCESS_TOKEN: optional,
  LINKEDIN_AUTHOR_URN: optional,

  /** "true" enables the one-click demo workspace outside development. */
  DEMO_WORKSPACE: optional,

  WORDPRESS_URL: optional,
  WORDPRESS_USER: optional,
  WORDPRESS_APP_PASSWORD: optional,
  GHOST_ADMIN_URL: optional,
  GHOST_ADMIN_KEY: optional,
  WEBFLOW_TOKEN: optional,
  WEBFLOW_COLLECTION_ID: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,
  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  INSTAGRAM_APP_ID: optional,
  INSTAGRAM_APP_SECRET: optional,

  FOUNDER_WAIT_MINUTES: z.coerce.number().int().min(1).default(30),
  MAX_REVISION_CYCLES: z.coerce.number().int().min(0).max(5).default(2),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** For tests: drop the cached parse so a changed process.env is re-read. */
export function resetEnvCache() {
  cached = undefined;
}

export function appSecret(): string {
  const e = env();
  if (e.APP_SECRET) return e.APP_SECRET;
  if (e.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set in production (signs review and order links).");
  }
  return "founderdesk-dev-secret-do-not-use-in-production";
}

export type IntegrationName = "agentmail" | "stripe" | "neon" | "naive" | "monid" | "openai" | "mobilerun" | "x" | "linkedin";

export type IntegrationStatus = {
  name: IntegrationName;
  label: string;
  role: string;
  live: boolean;
  detail: string;
};

export function integrationStatus(): IntegrationStatus[] {
  const e = env();
  const monidLive = Boolean(e.MONID_API_KEY);
  return [
    {
      name: "agentmail",
      label: "AgentMail",
      role: "Founder inbox, replies, clarification loop",
      live: Boolean(e.AGENTMAIL_API_KEY && e.AGENTMAIL_INBOX_ID),
      detail: e.AGENTMAIL_INBOX_ID ? `Inbox ${e.AGENTMAIL_INBOX_ID}` : "Outbound mail is recorded in the outbox, not sent",
    },
    {
      name: "stripe",
      label: "Stripe Checkout",
      role: "Payment starts fulfillment",
      live: Boolean(e.STRIPE_SECRET_KEY),
      detail: e.STRIPE_SECRET_KEY?.startsWith("sk_live")
        ? "Live mode"
        : e.STRIPE_SECRET_KEY
          ? "Test mode"
          : "Simulated checkout page",
    },
    {
      name: "neon",
      label: "Neon",
      role: "State and evidence",
      live: Boolean(e.DATABASE_URL),
      detail: e.DATABASE_URL
        ? "Serverless Postgres"
        : e.NODE_ENV === "production"
          ? "Not configured — orders are unavailable until DATABASE_URL is set"
          : "Local embedded Postgres (PGlite)",
    },
    {
      name: "naive",
      label: "Naïve",
      role: "Researcher, writer and reviewer agents",
      live: Boolean(e.NAIVE_API_KEY),
      detail: e.NAIVE_API_KEY ? `Model ${e.NAIVE_MODEL}` : "Deterministic local editorial engine",
    },
    {
      name: "monid",
      label: "Monid",
      role: "Source search and page extraction",
      live: monidLive,
      detail: monidLive
        ? `${e.MONID_SEARCH_PROVIDER ?? "?"}${e.MONID_SEARCH_ENDPOINT ?? ""} · ${e.MONID_FETCH_PROVIDER ?? "direct"}${e.MONID_FETCH_ENDPOINT ?? ""}`
        : "No web search; founder links fetched directly over HTTP",
    },
    {
      name: "openai",
      label: "OpenAI",
      role: "Transcribes audio and video attachments",
      live: Boolean(e.OPENAI_API_KEY),
      detail: e.OPENAI_API_KEY ? `Model ${e.OPENAI_TRANSCRIBE_MODEL}` : "Audio and video attachments are not read",
    },
    {
      name: "mobilerun",
      label: "Mobile Run",
      role: "Checks the live article on a real phone",
      live: Boolean(e.MOBILERUN_API_KEY && e.MOBILERUN_DEVICE_ID),
      detail: e.MOBILERUN_DEVICE_ID ? `Device ${e.MOBILERUN_DEVICE_ID.slice(0, 8)}…` : "HTTP check with a mobile user agent (no device)",
    },
    {
      name: "x",
      label: "X",
      role: "Optional announcement destination",
      live: Boolean(e.X_USER_ACCESS_TOKEN),
      detail: e.X_USER_ACCESS_TOKEN ? "Posts via API v2" : "Not connected",
    },
    {
      name: "linkedin",
      label: "LinkedIn",
      role: "Optional announcement destination",
      live: Boolean(e.LINKEDIN_ACCESS_TOKEN && e.LINKEDIN_AUTHOR_URN),
      detail: e.LINKEDIN_AUTHOR_URN ? `Author ${e.LINKEDIN_AUTHOR_URN}` : "Not connected",
    },
  ];
}

export function isLive(name: IntegrationName): boolean {
  return integrationStatus().find((s) => s.name === name)?.live ?? false;
}
