# Operations Runbook

Operational procedures for the WhatsApp Team Inbox (single-instance backend + Neon Postgres + S3 + Expo mobile).

## Health & monitoring

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness: DB ping. |
| `GET /health/ready` | Readiness: DB + job worker heartbeat (< 30s). Returns 503 if the worker stalled or has not polled yet. Point your uptime monitor here. |
| `GET /health/metrics` | Ops counters: `failedJobs`, `pendingJobs`, `webhookBacklog`, `oldestUnprocessedAgeSeconds`. |

### Recommended alerts

- Uptime monitor on `GET /health/ready` (alert on any non-200).
- Poll `GET /health/metrics` every minute and alert when:
  - `failedJobs > 0` (sustained) — jobs are permanently failing.
  - `webhookBacklog > 50` or `oldestUnprocessedAgeSeconds > 600` — inbound processing is falling behind (a background replay loop runs every 60s; a persistent backlog means handlers are erroring).
- Error tracking: set `SENTRY_DSN` (backend) and `EXPO_PUBLIC_SENTRY_DSN` (mobile) to capture exceptions.

### Manual diagnostics (SQL)

```sql
-- Permanently failed jobs
SELECT id, type, attempts, last_error, updated_at FROM jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 50;

-- Unprocessed webhook events (with error, if any)
SELECT id, received_at, error FROM webhook_events WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT 50;
```

## Webhook replay

Inbound webhooks are persisted to `webhook_events` before Meta is acked. Failed processing leaves `processed_at` NULL and is retried automatically:
- On startup (`replayUnprocessedWebhooks`).
- Every 60s by the background replay loop (`startWebhookReplayLoop`).

If a backlog persists, inspect the `error` column to find the failing handler; fix the root cause and the loop will drain it. Processed events older than 14 days are pruned automatically.

## Failed jobs

Jobs retry with backoff (1m / 5m / 30m) up to `maxAttempts` (default 3), then move to `status = 'failed'`. On permanent failure, `send_whatsapp_message` marks the message `failed` and `download_media` marks media `failed`.

To replay a permanently failed job manually:

```sql
UPDATE jobs SET status = 'pending', attempts = 0, next_retry_at = NOW() WHERE id = '<job-id>';
```

## Deploy

```bash
infra/deploy.sh
```

Runs: capture rollback SHA -> `npm ci` -> typecheck + tests (gate) -> build -> migrate -> `pm2 reload` -> `/health/ready` smoke test. A failed smoke test exits non-zero.

## Rollback

Code rollback (does NOT undo migrations):

```bash
infra/rollback.sh            # to the SHA captured by the last deploy (.deploy-prev-sha)
infra/rollback.sh <git-sha>  # to a specific commit
```

Write migrations as backward-compatible (expand/contract) so the previous release runs against the new schema. For destructive schema changes, restore the DB (below) instead.

## Database backup & restore (Neon)

Neon provides automated backups and point-in-time restore (PITR).

**Backup verification (do this as a drill before launch):**
1. In the Neon console, confirm PITR retention is enabled for the project (default 7 days; increase for production).
2. Create a branch from a past timestamp: `Neon console -> Branches -> Create branch -> from a point in time`.
3. Point a staging copy of the app at the branch's connection string and verify data is intact.

**Restore procedure (incident):**
1. Identify the target timestamp (before the bad change).
2. Create a Neon branch at that timestamp.
3. Either promote the branch or repoint `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to it.
4. Redeploy / restart the backend.
5. Validate `/health/ready` and spot-check recent conversations.

**Restore drill cadence:** run the verification steps at least quarterly so the procedure is known-good.

## Secrets rotation

- `JWT_SECRET` (>=64 chars in prod): rotating invalidates all access tokens; clients refresh automatically.
- WhatsApp / AWS / Anthropic keys: update env and `pm2 reload`.
- After rotating, confirm `/health/ready` and send a test message.
