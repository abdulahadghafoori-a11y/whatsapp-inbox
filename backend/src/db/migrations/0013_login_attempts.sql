-- Distributed login throttle: shared across API instances (was in-memory only).
CREATE TABLE IF NOT EXISTS login_attempts (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
--> statement-breakpoint
-- Lets a periodic cleanup prune expired counters efficiently.
CREATE INDEX IF NOT EXISTS idx_login_attempts_reset_at ON login_attempts(reset_at);
