import './types.js'
import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { sql } from 'drizzle-orm'
import { config, corsOrigins, isProd } from './config.js'
import { db } from './db/index.js'
import { AppError } from './utils/errors.js'
import { redactForLog } from './utils/log-redact.js'
import { captureException, initObservability } from './utils/observability.js'
import { authPlugin } from './plugins/auth.js'
import { s3Plugin } from './plugins/s3.js'
import { socketPlugin } from './plugins/socket.js'
import { authRoutes } from './routes/auth.js'
import { webhookRoutes } from './routes/webhook.js'
import { conversationRoutes } from './routes/conversations.js'
import { messageRoutes } from './routes/messages.js'
import { mediaRoutes } from './routes/media.js'
import { teamRoutes } from './routes/team.js'
import { templateRoutes } from './routes/templates.js'
import { tagRoutes } from './routes/tags.js'
import { cannedResponseRoutes } from './routes/canned.js'
import { internalRoutes } from './routes/internal.js'
import { startJobProcessor, jobProcessorHeartbeat } from './workers/job-processor.js'
import {
  replayUnprocessedWebhooks,
  startWebhookReplayLoop,
} from './services/webhook-inbox.js'
async function buildServer() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      transport: isProd ? undefined : { target: 'pino-pretty' },
      // Was: redactForLog existed but was never wired in, so logs could leak
      // tokens/passwords. Deep-redact every log object plus common header paths.
      formatters: {
        log: (obj) => redactForLog(obj),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          'headers.cookie',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: true,
    // Was: no request id — hard to trace webhook/job failures across logs.
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  })

  // Consistent error envelope: { error, code, statusCode }.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.statusCode)
        .send({ error: err.message, code: err.code, statusCode: err.statusCode })
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: err.issues,
      })
    }
    if (err.statusCode === 429) {
      return reply
        .code(429)
        .send({ error: 'Too many requests', code: 'RATE_LIMITED', statusCode: 429 })
    }
    app.log.error({ err }, 'unhandled error')
    if ((err.statusCode ?? 500) >= 500) captureException(err, { reqId: _req.id })
    const statusCode = err.statusCode ?? 500
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
      statusCode,
    })
  })

  // Was: no security headers — added helmet for production hardening.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })

  await app.register(cors, { origin: corsOrigins() })
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  })
  // Webhook bursts exceed 100/min; exempt Meta POST from global cap.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: (req) =>
      req.method === 'POST' &&
      (req.url.startsWith('/api/webhook/whatsapp') || req.url.startsWith('/internal/')),
  })

  await app.register(authPlugin)
  await app.register(s3Plugin)
  await app.register(socketPlugin)

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(webhookRoutes, { prefix: '/api/webhook' })
  await app.register(conversationRoutes, { prefix: '/api/conversations' })
  await app.register(messageRoutes, { prefix: '/api/messages' })
  await app.register(mediaRoutes, { prefix: '/api/media' })
  await app.register(teamRoutes, { prefix: '/api/team' })
  await app.register(templateRoutes, { prefix: '/api/templates' })
  await app.register(tagRoutes, { prefix: '/api/tags' })
  await app.register(cannedResponseRoutes, { prefix: '/api/canned-responses' })
  await app.register(internalRoutes, { prefix: '/internal' })

  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`)
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  app.get('/health/ready', async (_req, reply) => {
    try {
      await db.execute(sql`SELECT 1`)
    } catch {
      return reply.code(503).send({ status: 'db_unavailable' })
    }
    const since = Date.now() - jobProcessorHeartbeat()
    // Readiness requires at least one completed poll. Was: heartbeat===0 (before
    // the first poll) was treated as healthy, masking a worker that never started.
    const workerHealthy = jobProcessorHeartbeat() !== 0 && since < 30_000
    if (!workerHealthy) {
      return reply.code(503).send({ status: 'worker_stalled', lastPollMsAgo: since })
    }
    return { status: 'ready', timestamp: new Date().toISOString() }
  })

  // Lightweight ops metrics for external monitoring/alerting (failed jobs,
  // webhook backlog). Poll this and alert on thresholds.
  app.get('/health/metrics', async (_req, reply) => {
    try {
      const result = await db.execute<{
        failed_jobs: number
        pending_jobs: number
        webhook_backlog: number
        oldest_unprocessed_age_s: number | null
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM jobs WHERE status = 'failed')::int AS failed_jobs,
          (SELECT COUNT(*) FROM jobs WHERE status = 'pending')::int AS pending_jobs,
          (SELECT COUNT(*) FROM webhook_events WHERE processed_at IS NULL)::int AS webhook_backlog,
          (SELECT EXTRACT(EPOCH FROM (NOW() - MIN(received_at)))
             FROM webhook_events WHERE processed_at IS NULL)::int AS oldest_unprocessed_age_s
      `)
      const row = result.rows[0]
      return {
        status: 'ok',
        failedJobs: row?.failed_jobs ?? 0,
        pendingJobs: row?.pending_jobs ?? 0,
        webhookBacklog: row?.webhook_backlog ?? 0,
        oldestUnprocessedAgeSeconds: row?.oldest_unprocessed_age_s ?? null,
        timestamp: new Date().toISOString(),
      }
    } catch {
      return reply.code(503).send({ status: 'db_unavailable' })
    }
  })

  return app
}

async function main() {
  initObservability()
  const app = await buildServer()

  let stopProcessor = () => {}
  let stopReplayLoop = () => {}

  const shutdown = async (signal: string) => {
    try {
      app.log.info({ signal }, 'shutting down')
      stopReplayLoop()
      stopProcessor()
      await app.close()
      process.exit(0)
    } catch (err) {
      console.error('shutdown failed:', err)
      process.exit(1)
    }
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // Was: unhandled rejections could crash silently in production.
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason)
    app.log.error({ err: reason }, 'unhandledRejection')
    captureException(reason)
    if (isProd) process.exit(1)
  })
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err)
    app.log.error({ err }, 'uncaughtException')
    captureException(err)
    process.exit(1)
  })

  stopProcessor = startJobProcessor(app)

  const replayed = await replayUnprocessedWebhooks(app)
  if (replayed > 0) {
    app.log.info({ replayed }, 'replayed unprocessed webhook events')
  }
  stopReplayLoop = startWebhookReplayLoop(app)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
