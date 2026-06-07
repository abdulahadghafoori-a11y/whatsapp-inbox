-- Media reuse authorization looks up messages by S3 key.
CREATE INDEX IF NOT EXISTS "idx_messages_media_url" ON "messages" ("media_url") WHERE "media_url" IS NOT NULL;
--> statement-breakpoint
-- Conversation router: online human agents with fewest open chats.
CREATE INDEX IF NOT EXISTS "idx_team_members_agent_online" ON "team_members" ("is_online") WHERE "role" = 'agent';
