CREATE TABLE "image_credit_grants" (
	"checkout_session_id" text PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"mime" text,
	"data" "bytea",
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "image_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "image_credit_grants" ADD CONSTRAINT "image_credit_grants_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_job_idx" ON "images" USING btree ("job_id");