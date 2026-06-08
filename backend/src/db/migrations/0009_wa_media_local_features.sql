-- Phase A/B/C: media thumbs + size, starred messages, reactions
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_thumb_url text;
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_file_size integer;
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS starred_at timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_messages_starred
  ON messages (conversation_id, starred_at DESC)
  WHERE starred_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_message_reaction UNIQUE (message_id, agent_id, emoji)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
