import { desc } from "drizzle-orm";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { links } from "@/lib/links";
import { safeEqual } from "@/lib/security";
import { orderView } from "@/lib/views";
import { createJob, recordFounderReply } from "@/lib/workflow/intake";
import { kick } from "@/lib/workflow/run";
import { getJob } from "@/lib/workflow/store";

export const maxDuration = 60;

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/**
 * FounderDesk MCP server. Lets an agent client (Claude, Muse via mcp-remote…)
 * submit briefs, follow orders, read drafts with their findings, and relay the
 * founder's answers. Approval is intentionally NOT a tool: publishing requires
 * the founder's deliberate action on the private review page.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "submit_brief",
      {
        title: "Submit an article brief",
        description: "Create an order from the founder's notes. Returns the order page and the payment link. Research starts once payment completes.",
        inputSchema: z.object({
          founder_email: z.string().email(),
          founder_name: z.string().optional(),
          title: z.string().min(3).describe("Working title or topic"),
          notes: z.string().min(40).describe("Thesis, audience, first-hand observations, links and any boundaries such as names to keep private"),
        }),
      },
      async ({ founder_email, founder_name, title, notes }) => {
        const job = await createJob({ channel: "mcp", founderEmail: founder_email, founderName: founder_name ?? null, subject: title, body: notes });
        kick();
        return text({ order_id: job.id, stage: job.stage, thesis: job.thesis, audience: job.audience, order_url: links.order(job.id), payment_url: links.checkout(job.id) });
      },
    );

    server.registerTool(
      "get_order",
      {
        title: "Get order status",
        description: "Stage, open questions for the founder, and the relevant links for one order.",
        inputSchema: z.object({ order_id: z.string().uuid() }),
      },
      async ({ order_id }) => {
        const v = await orderView(order_id);
        if (!v) return text(`No order ${order_id}`);
        return text({
          order_id,
          topic: v.job.topic,
          stage: v.job.stage,
          stage_reason: v.job.stageReason,
          paid: v.job.paymentStatus === "paid",
          open_questions: v.job.openQuestions,
          draft_version: v.draft?.version ?? null,
          review_outcome: v.review?.outcome ?? null,
          order_url: links.order(order_id),
          review_url: v.job.stage === "READY_FOR_APPROVAL" ? links.review(order_id) : null,
          article_url: v.web?.status === "published" ? v.web.url : null,
          phone_check: v.web?.mobileCheck ?? null,
        });
      },
    );

    server.registerTool(
      "list_orders",
      {
        title: "List recent orders",
        description: "Most recent orders first.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
      },
      async ({ limit }) => {
        const db = await getDb();
        const rows = await db.select({ id: jobs.id, topic: jobs.topic, stage: jobs.stage, founder: jobs.founderEmail, created: jobs.createdAt }).from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
        return text(rows);
      },
    );

    server.registerTool(
      "get_draft",
      {
        title: "Read the current draft",
        description: "The latest draft in Markdown, the reviewer's findings, and the sources it cites.",
        inputSchema: z.object({ order_id: z.string().uuid() }),
      },
      async ({ order_id }) => {
        const v = await orderView(order_id);
        if (!v?.draft) return text("No draft yet.");
        return text({
          version: v.draft.version,
          title: v.draft.title,
          dek: v.draft.dek,
          body_markdown: v.draft.bodyMarkdown,
          corrections: v.draft.corrections,
          review: v.review ? { outcome: v.review.outcome, summary: v.review.summary, findings: v.review.findings } : null,
          sources: v.sources.filter((s) => s.status === "fetched").map((s) => ({ ref: s.ref, title: s.title, url: s.url, kind: s.kind })),
        });
      },
    );

    server.registerTool(
      "answer_question",
      {
        title: "Relay the founder's answer",
        description: "Record the founder's answer to an open reviewer question. The reviewer re-assesses; an answer that does not resolve the question keeps the order waiting.",
        inputSchema: z.object({ order_id: z.string().uuid(), answer: z.string().min(2) }),
      },
      async ({ order_id, answer }) => {
        const job = await getJob(order_id);
        if (!job) return text(`No order ${order_id}`);
        const updated = await recordFounderReply(job, { text: answer });
        kick();
        return text({ order_id, stage: updated.stage, note: "Answer recorded; the reviewer will re-assess." });
      },
    );
  },
  { serverInfo: { name: "founderdesk", version: "1.0.0" } },
);

const authed = withMcpAuth(
  handler,
  (_req, bearer) => {
    const key = env().MCP_API_KEY;
    if (!key || !bearer || !safeEqual(bearer, key)) return undefined;
    return { token: bearer, clientId: "founderdesk-operator", scopes: ["orders"] };
  },
  { required: true },
);

export { authed as GET, authed as POST };
