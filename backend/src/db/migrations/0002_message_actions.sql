ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk"
    FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_reply_to" ON "messages" ("reply_to_message_id");
