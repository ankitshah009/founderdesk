CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"role" text NOT NULL,
	"request_key" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_daily" (
	"publication_id" uuid NOT NULL,
	"day" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"workflow_id" uuid,
	"persona_id" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"origin" text DEFAULT 'founder' NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"instruction" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_draft_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT 'linkedin' NOT NULL,
	"hooks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'exploring' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"url" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"origin" text NOT NULL,
	"job_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"company" text,
	"brand" jsonb,
	"onboarded_at" timestamp with time zone,
	"voice" jsonb,
	"style_guide" jsonb DEFAULT '{"preferredTerms":[],"bannedPhrases":[],"tone":"","formatting":[]}'::jsonb NOT NULL,
	"personas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"auto_post" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"author" text NOT NULL,
	"platform" text NOT NULL,
	"url" text,
	"text" text NOT NULL,
	"posted_at" timestamp with time zone,
	"impressions" integer,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"followers" integer,
	"captured_via" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"agent_title" text,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"persona_id" text,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cadence" text DEFAULT 'none' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "persona_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "reads" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "scores" jsonb;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_daily" ADD CONSTRAINT "article_daily_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_result_draft_id_drafts_id_fk" FOREIGN KEY ("result_draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_key_idx" ON "agent_runs" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "agent_runs_job_idx" ON "agent_runs" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_daily_pk" ON "article_daily" USING btree ("publication_id","day");--> statement-breakpoint
CREATE INDEX "calendar_owner_idx" ON "calendar_entries" USING btree ("owner_email","date");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_workflow_date_idx" ON "calendar_entries" USING btree ("workflow_id","date") WHERE "calendar_entries"."workflow_id" is not null;--> statement-breakpoint
CREATE INDEX "edit_requests_job_idx" ON "edit_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ideas_owner_idx" ON "ideas" USING btree ("owner_email");--> statement-breakpoint
CREATE INDEX "knowledge_owner_idx" ON "knowledge_items" USING btree ("owner_email","kind");--> statement-breakpoint
CREATE INDEX "memories_owner_idx" ON "memories" USING btree ("owner_email");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_owner_provider_idx" ON "social_accounts" USING btree ("owner_email","provider");--> statement-breakpoint
CREATE INDEX "social_posts_owner_idx" ON "social_posts" USING btree ("owner_email","author");--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_ext_idx" ON "social_posts" USING btree ("owner_email","platform","external_id");--> statement-breakpoint
CREATE INDEX "workflows_owner_idx" ON "workflows" USING btree ("owner_email");