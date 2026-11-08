ALTER TABLE "approvals" ADD COLUMN "image_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "images_hash" text;