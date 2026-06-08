-- Phase 2: content-addressed media registry (dedup + reusable WhatsApp handle)
CREATE TABLE IF NOT EXISTS media_blobs (
  sha256 text PRIMARY KEY,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  width integer,
  height integer,
  thumbhash text,
  duration_ms integer,
  wa_media_id text,
  wa_media_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_blobs_storage_key ON media_blobs(storage_key);
