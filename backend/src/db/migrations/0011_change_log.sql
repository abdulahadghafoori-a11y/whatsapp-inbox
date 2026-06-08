-- Phase 5: global change feed for delta sync.
-- A monotonic bigserial seq drives the device pull cursor. Triggers guarantee
-- every message/conversation mutation is recorded regardless of code path.
CREATE TABLE IF NOT EXISTS change_log (
  seq bigserial PRIMARY KEY,
  entity text NOT NULL,
  entity_id text NOT NULL,
  conversation_id text,
  op text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_change_log_seq ON change_log(seq);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO change_log (entity, entity_id, conversation_id, op)
    VALUES (
      TG_ARGV[0],
      OLD.id::text,
      CASE WHEN TG_ARGV[0] = 'message' THEN OLD.conversation_id::text ELSE OLD.id::text END,
      'delete'
    );
    RETURN OLD;
  ELSE
    INSERT INTO change_log (entity, entity_id, conversation_id, op)
    VALUES (
      TG_ARGV[0],
      NEW.id::text,
      CASE WHEN TG_ARGV[0] = 'message' THEN NEW.conversation_id::text ELSE NEW.id::text END,
      'upsert'
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_messages_change ON messages;
--> statement-breakpoint
CREATE TRIGGER trg_messages_change
AFTER INSERT OR UPDATE OR DELETE ON messages
FOR EACH ROW EXECUTE FUNCTION log_change('message');
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_conversations_change ON conversations;
--> statement-breakpoint
CREATE TRIGGER trg_conversations_change
AFTER INSERT OR UPDATE OR DELETE ON conversations
FOR EACH ROW EXECUTE FUNCTION log_change('conversation');
