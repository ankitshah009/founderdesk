CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"destination" text NOT NULL,
	"action" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"provider_ref" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 4 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"author" text NOT NULL,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"body_markdown" text NOT NULL,
	"announcement" text NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source_id" uuid,
	"passage" text NOT NULL,
	"supports" text NOT NULL,
	"kind" text DEFAULT 'supporting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"founder_email" text NOT NULL,
	"founder_name" text,
	"inbox_id" text,
	"thread_id" text,
	"first_message_id" text,
	"last_message_id" text,
	"topic" text NOT NULL,
	"audience" text,
	"thesis" text,
	"seed_text" text NOT NULL,
	"source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"boundaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"private_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stage" text DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"stage_reason" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"amount_cents" integer DEFAULT 4900 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"checkout_session_id" text,
	"checkout_url" text,
	"paid_at" timestamp with time zone,
	"revision_cycles" integer DEFAULT 0 NOT NULL,
	"source_seq" integer DEFAULT 0 NOT NULL,
	"founder_replies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destinations" jsonb DEFAULT '["web"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_key" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"in_reply_to" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"job_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"note" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"slug" text,
	"url" text,
	"external_id" text,
	"content_hash" text NOT NULL,
	"status" text NOT NULL,
	"verification" jsonb,
	"mobile_check" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"summary" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"founder_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"title" text,
	"snippet" text,
	"content" text,
	"published_date" text,
	"content_hash" text,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_draft_dest_idx" ON "approvals" USING btree ("draft_id","destination");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatches_request_key_idx" ON "dispatches" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "dispatches_runnable_idx" ON "dispatches" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "dispatches_job_idx" ON "dispatches" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_job_version_idx" ON "drafts" USING btree ("job_id","version");--> statement-breakpoint
CREATE INDEX "evidence_job_idx" ON "evidence" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_thread_idx" ON "jobs" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_checkout_idx" ON "jobs" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "jobs_stage_idx" ON "jobs" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_request_key_idx" ON "outbound_messages" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "outbound_job_idx" ON "outbound_messages" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_ext_idx" ON "provider_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_job_dest_idx" ON "publications" USING btree ("job_id","destination");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_slug_idx" ON "publications" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "reviews_job_idx" ON "reviews" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_job_ref_idx" ON "sources" USING btree ("job_id","ref");--> statement-breakpoint
CREATE INDEX "sources_job_idx" ON "sources" USING btree ("job_id");