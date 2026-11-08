ALTER TABLE "approvals" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "publish_at" timestamp with time zone;