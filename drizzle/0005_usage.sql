ALTER TABLE "dispatches" ADD COLUMN "cost_micro_usd" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "finished_at" timestamp with time zone;