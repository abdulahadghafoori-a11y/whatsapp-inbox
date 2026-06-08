-- Fix log_change(): CASE still type-checks NEW.conversation_id on conversation
-- rows, causing mark-read (conversation UPDATE) to 500.
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger AS $$
DECLARE
  conv_id text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF TG_ARGV[0] = 'message' THEN
      conv_id := OLD.conversation_id::text;
    ELSE
      conv_id := OLD.id::text;
    END IF;
    INSERT INTO change_log (entity, entity_id, conversation_id, op)
    VALUES (TG_ARGV[0], OLD.id::text, conv_id, 'delete');
    RETURN OLD;
  ELSE
    IF TG_ARGV[0] = 'message' THEN
      conv_id := NEW.conversation_id::text;
    ELSE
      conv_id := NEW.id::text;
    END IF;
    INSERT INTO change_log (entity, entity_id, conversation_id, op)
    VALUES (TG_ARGV[0], NEW.id::text, conv_id, 'upsert');
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
