CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_id" text NOT NULL,
	"name" text,
	"profile_picture_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_wa_id_unique" UNIQUE("wa_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"assigned_to" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"window_expires_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"snoozed_until" timestamp with time zone,
	"ctwa_clid" text,
	"referral_source_url" text,
	"referral_source_type" text,
	"ad_id" text,
	"ad_title" text,
	"ad_body" text,
	"referral_metadata" jsonb,
	"handoff_requested_at" timestamp with time zone,
	"handoff_reason" text,
	"ai_handled" boolean DEFAULT false NOT NULL,
	"routing_lock" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"wa_message_id" text,
	"sent_by" uuid,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"media_url" text,
	"media_mime_type" text,
	"media_filename" text,
	"media_status" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"agent_config" jsonb,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"expo_push_token" text,
	"token_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_actor_id_team_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_team_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_team_members_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_events_conversation" ON "conversation_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversations_contact" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_status" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_assigned_to" ON "conversations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_last_message_at" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_inbox" ON "conversations" USING btree ("assigned_to","status","last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_status_next_retry" ON "jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_status_created" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_sent_at" ON "messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_wa_message_id" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_member" ON "refresh_tokens" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash" ON "refresh_tokens" USING btree ("token_hash");