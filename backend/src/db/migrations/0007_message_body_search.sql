-- Global message-content search uses ILIKE '%term%' on messages.body. Add a
-- pg_trgm GIN index so it stays sargable as the message volume grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_body_trgm" ON "messages" USING gin ("body" gin_trgm_ops);
