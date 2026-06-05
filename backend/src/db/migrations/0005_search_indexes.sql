-- Inbox search used leading-wildcard ILIKE on these columns with no supporting
-- index (full table scans at scale). pg_trgm GIN indexes make ILIKE '%term%'
-- sargable. Also add a composite index for message-history pagination.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_name_trgm" ON "contacts" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_wa_id_trgm" ON "contacts" USING gin ("wa_id" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_preview_trgm" ON "conversations" USING gin ("last_message_preview" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_ctwa_clid_trgm" ON "conversations" USING gin ("ctwa_clid" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_sent_at" ON "messages" USING btree ("conversation_id", "sent_at" DESC);
