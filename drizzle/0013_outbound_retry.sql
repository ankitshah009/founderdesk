ALTER TABLE "outbound_messages" ADD COLUMN "retry_at" timestamp with time zone;--> statement-breakpoint
UPDATE "outbound_messages" SET "state" = 'pending', "retry_at" = now() WHERE "state" = 'failed' AND "error" LIKE '%rate_limit%';
