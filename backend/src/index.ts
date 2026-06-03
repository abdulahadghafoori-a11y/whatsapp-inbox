import './types.js'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { sql } from 'drizzle-orm'
import { config, corsOrigins, isProd } from './config.js'
import { db } from './db/index.js'
import { AppError } from './utils/errors.js'
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
import { startJobProcessor, jobProcessorHeartbeat } from './workers/job-processor.js'
import { getFfmpegPath } from './utils/ffmpeg-path.js'
import { spawnSync } from 'child_process'

function logFfmpegAtStartup(log: { info: (o: object, msg: string) => void }): void {
  const bin = getFfmpegPath()
  const ver = spawnSync(bin, ['-version'], { encoding: 'utf8' })
  log.info(
    {
      ffmpeg: bin,
      version: ver.stdout?.split('\n')[0]?.trim() ?? ver.stderr?.slice(0, 120),
    },
    'ffmpeg_ready',
  )
}

async function buildServer() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      transport: isProd ? undefined : { target: 'pino-pretty' },
    },
    trustProxy: true,
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
    const statusCode = err.statusCode ?? 500
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
      statusCode,
    })
  })

  await app.register(cors, { origin: corsOrigins() })
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

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
    const workerHealthy = jobProcessorHeartbeat() === 0 || since < 30_000
    if (!workerHealthy) {
      return reply.code(503).send({ status: 'worker_stalled', lastPollMsAgo: since })
    }
    return { status: 'ready', timestamp: new Date().toISOString() }
  })

  return app
}

async function main() {
  const app = await buildServer()
  logFfmpegAtStartup(app.log)
  const stopProcessor = startJobProcessor(app)

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    stopProcessor()
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
