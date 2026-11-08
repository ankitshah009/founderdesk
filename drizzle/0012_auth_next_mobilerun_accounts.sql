ALTER TABLE "auth_challenges" ADD COLUMN "next" text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "via" text DEFAULT 'oauth' NOT NULL;