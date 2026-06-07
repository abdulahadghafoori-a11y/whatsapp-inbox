import { and, asc, eq, isNotNull, isNull, like, lt, not, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import { webhookEvents } from '../db/schema.js'
import { processWebhookPayload } from './webhook-processor.js'
import { captureException } from '../utils/observability.js'

/** How often the background replay loop scans for unprocessed events. */
const REPLAY_INTERVAL_MS = 60_000
/** Processed webhook_events older than this are pruned to bound table growth. */
const RETENTION_DAYS = 14
/** Reclaim events stuck in `processing:*` after a crash mid-handler. */
const PROCESSING_STALE_MS = 10 * 60 * 1000
export const WEBHOOK_PROCESSING_PREFIX = 'processing:'

/**
 * Single-winner claim so setImmediate + replay loop cannot process the same row twice.
 * Failed rows (real error text) remain replayable; stale `processing:*` locks are reclaimed.
 */
export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS)
  const claimed = await db
    .update(webhookEvents)
    .set({ error: `${WEBHOOK_PROCESSING_PREFIX}${Date.now()}` })
    .where(
      and(
        eq(webhookEvents.id, eventId),
        isNull(webhookEvents.processedAt),
        or(
          isNull(webhookEvents.error),
          not(like(webhookEvents.error, `${WEBHOOK_PROCESSING_PREFIX}%`)),
          and(
            like(webhookEvents.error, `${WEBHOOK_PROCESSING_PREFIX}%`),
            lt(webhookEvents.receivedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: webhookEvents.id })
  return claimed.length > 0
}

/**
 * Was: webhook returned 200 before any DB write — a crash after ack lost events forever.
 * Now: insert raw payload first, ack Meta, then process by event id (replayable).
 */
export async function persistWebhookPayload(payload: unknown): Promise<string> {
  const [row] = await db
    .insert(webhookEvents)
    .values({ rawPayload: payload as Record<string, unknown> })
    .returning({ id: webhookEvents.id })
  return row.id
}

export async function processWebhookEvent(
  app: FastifyInstance,
  eventId: string,
  payload: unknown,
): Promise<void> {
  if (!(await claimWebhookEvent(eventId))) {
    app.log.debug({ eventId }, 'webhook event skipped (already processing or processed)')
    return
  }

  try {
    await processWebhookPayload(app, payload)
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(webhookEvents.id, eventId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(webhookEvents)
      .set({ error: message })
      .where(eq(webhookEvents.id, eventId))
    captureException(err, { eventId })
    throw err
  }
}

/** Replay events that were stored but never marked processed (e.g. crash mid-handler). */
export async function replayUnprocessedWebhooks(
  app: FastifyInstance,
  limit = 200,
): Promise<number> {
  const pending = await db
    .select()
    .from(webhookEvents)
    .where(isNull(webhookEvents.processedAt))
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(limit)
  let processed = 0
  for (const row of pending) {
    try {
      await processWebhookEvent(app, row.id, row.rawPayload)
      processed++
    } catch (err) {
      app.log.error({ err, eventId: row.id }, 'webhook replay failed')
    }
  }
  return processed
}

/** Prune processed webhook events older than the retention window. */
export async function cleanupOldWebhookEvents(app: FastifyInstance): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const deleted = await db
    .delete(webhookEvents)
    .where(and(isNotNull(webhookEvents.processedAt), lt(webhookEvents.receivedAt, cutoff)))
    .returning({ id: webhookEvents.id })
  if (deleted.length > 0) {
    app.log.info({ deleted: deleted.length }, 'pruned old webhook events')
  }
  return deleted.length
}

/**
 * Background loop that periodically replays unprocessed webhook events and prunes
 * old ones. Was: replay ran only at startup (cap 50), so a backlog or a failure
 * after boot could stall inbound processing until the next deploy.
 */
export function startWebhookReplayLoop(app: FastifyInstance): () => void {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const replayed = await replayUnprocessedWebhooks(app)
      if (replayed > 0) app.log.info({ replayed }, 'background webhook replay processed events')
      await cleanupOldWebhookEvents(app)
    } catch (err) {
      app.log.error({ err }, 'webhook replay loop error')
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => {
    void tick().catch((err) => app.log.error({ err }, 'webhook replay loop tick failed'))
  }, REPLAY_INTERVAL_MS)
  if (typeof interval.unref === 'function') interval.unref()
  return () => clearInterval(interval)
}
