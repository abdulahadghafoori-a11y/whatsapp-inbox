CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_received_at" ON "webhook_events" USING btree ("received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_unprocessed" ON "webhook_events" USING btree ("processed_at") WHERE "processed_at" IS NULL;
