ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_direction" text;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_status" text;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_type" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_pinned_at" ON "conversations" ("pinned_at" DESC NULLS LAST);
