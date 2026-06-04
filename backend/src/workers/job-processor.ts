import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import { jobs, messages, type Job } from '../db/schema.js'
import { whatsapp } from '../services/whatsapp.js'
import { processDownloadMedia } from '../services/media-processor.js'
import { processAIAgentReply } from '../services/ai-agent.js'
import { sendPushNotification } from '../services/push-notifications.js'
import type { JobPayloads } from '../services/jobs.js'
import { emitMediaFailed, emitMessageStatus } from '../services/socket-events.js'

const POLL_INTERVAL_MS = 5000
const BATCH_SIZE = 10
const STALE_PROCESSING_MIN = 2
const WORKER_ID = randomUUID()

let lastPollAt = 0
/** Timestamp (ms) of the last completed poll — used by /health/ready. */
export const jobProcessorHeartbeat = () => lastPollAt

/** Backoff per attempt number (after increment): 1m, 5m, 30m. */
function backoffMinutes(attempts: number): number {
  if (attempts <= 1) return 1
  if (attempts === 2) return 5
  return 30
}

export function startJobProcessor(app: FastifyInstance): () => void {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    processNextBatch(app)
      .catch((err) => app.log.error({ err }, 'job batch failed'))
      .finally(() => {
        lastPollAt = Date.now()
        running = false
      })
  }, POLL_INTERVAL_MS)

  app.log.info({ workerId: WORKER_ID }, 'job processor started')
  return () => clearInterval(timer)
}

async function processNextBatch(app: FastifyInstance): Promise<void> {
  // Recover jobs orphaned by a crashed worker.
  await db.execute(sql`
    UPDATE jobs SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND locked_at < NOW() - (${STALE_PROCESSING_MIN} * INTERVAL '1 minute')
  `)

  // Atomically claim a batch (safe even if a second instance is ever added).
  const claimed = await db.execute<Job>(sql`
    UPDATE jobs
    SET status = 'processing',
        attempts = attempts + 1,
        locked_at = NOW(),
        locked_by = ${WORKER_ID},
        updated_at = NOW()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status IN ('pending', 'failed')
        AND next_retry_at <= NOW()
        AND attempts < max_attempts
      ORDER BY next_retry_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `)

  for (const job of claimed.rows as Job[]) {
    await runJob(app, job)
  }
}

async function runJob(app: FastifyInstance, job: Job): Promise<void> {
  const log = app.log.child({ jobId: job.id, jobType: job.type })
  try {
    await dispatch(app, job)
    await db
      .update(jobs)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date(), lastError: null })
      .where(eq(jobs.id, job.id))
    log.debug('job done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const exhausted = job.attempts >= job.maxAttempts
    await db
      .update(jobs)
      .set({
        status: exhausted ? 'failed' : 'pending',
        nextRetryAt: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000),
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id))

    if (exhausted) {
      log.error({ err: message, attempts: job.attempts }, 'job failed permanently')
      await onPermanentFailure(app, job)
    } else {
      log.warn({ err: message, attempts: job.attempts }, 'job failed; will retry')
    }
  }
}

async function dispatch(app: FastifyInstance, job: Job): Promise<void> {
  switch (job.type) {
    case 'send_whatsapp_message':
      return handleSendMessage(app, job.payload as JobPayloads['send_whatsapp_message'])
    case 'download_media':
      return processDownloadMedia(
        app.s3,
        app.io,
        app.log,
        job.payload as JobPayloads['download_media'],
      )
    case 'send_push_notification':
      return sendPushNotification(
        app.log,
        job.payload as JobPayloads['send_push_notification'],
      )
    case 'ai_agent_reply':
      return processAIAgentReply(
        app.io,
        app.log,
        job.payload as JobPayloads['ai_agent_reply'],
      )
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function handleSendMessage(
  app: FastifyInstance,
  p: JobPayloads['send_whatsapp_message'],
): Promise<void> {
  let result: { message_id: string }
  if (p.type === 'text') {
    result = await whatsapp.sendTextMessage(app.log, p.to, p.body ?? '', {
      replyToWaMessageId: p.replyToWaMessageId,
    })
  } else if (p.type === 'location' && p.location) {
    result = await whatsapp.sendLocationMessage(app.log, p.to, p.location, {
      replyToWaMessageId: p.replyToWaMessageId,
    })
  } else {
    const mediaOpts: { voice?: boolean; replyToWaMessageId?: string } = {}
    if (p.replyToWaMessageId) mediaOpts.replyToWaMessageId = p.replyToWaMessageId
    if (p.type === 'audio' && p.voiceNote) mediaOpts.voice = true
    result = await whatsapp.sendMediaMessage(
      app.log,
      p.to,
      p.type,
      p.mediaId ?? '',
      p.caption,
      mediaOpts,
    )
  }

  await db
    .update(messages)
    .set({ waMessageId: result.message_id, status: 'sent' })
    .where(eq(messages.id, p.messageId))

  emitMessageStatus(app.io, {
    conversationId: p.conversationId,
    messageId: p.messageId,
    waMessageId: result.message_id,
    status: 'sent',
  })
}

async function onPermanentFailure(app: FastifyInstance, job: Job): Promise<void> {
  if (job.type === 'download_media') {
    const p = job.payload as JobPayloads['download_media']
    await db
      .update(messages)
      .set({ mediaStatus: 'failed' })
      .where(eq(messages.id, p.messageId))
    emitMediaFailed(app.io, p.conversationId, p.messageId)
  }
  if (job.type === 'send_whatsapp_message') {
    const p = job.payload as JobPayloads['send_whatsapp_message']
    await db
      .update(messages)
      .set({ status: 'failed', errorMessage: job.lastError })
      .where(eq(messages.id, p.messageId))
    emitMessageStatus(app.io, {
      conversationId: p.conversationId,
      messageId: p.messageId,
      status: 'failed',
    })
  }
}
