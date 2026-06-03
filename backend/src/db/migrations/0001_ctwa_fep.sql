ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "ctwa_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "fep_expires_at" timestamp with time zone;
