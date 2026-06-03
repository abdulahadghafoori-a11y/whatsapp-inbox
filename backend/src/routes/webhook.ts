import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { config, isProd } from '../config.js'
import { processWebhookPayload } from '../services/webhook-processor.js'

/**
 * WhatsApp webhook.
 *
 * GET  -> verification handshake (hub.challenge)
 * POST -> verify x-hub-signature-256 over the RAW body, ack 200 immediately,
 *         then process asynchronously so Meta never sees processing latency.
 */
export async function webhookRoutes(app: FastifyInstance) {
  // Meta signs the exact raw POST bytes. Fastify's default JSON parser must be
  // replaced in this plugin scope or HMAC verification always fails.
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      try {
        const raw = body as Buffer
        const json = raw.length ? JSON.parse(raw.toString('utf8')) : {}
        ;(req as FastifyRequest).rawBody = raw
        done(null, json)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // GET verification handshake.
  app.get('/whatsapp', async (request, reply) => {
    const q = request.query as Record<string, string>
    const mode = q['hub.mode']
    const token = q['hub.verify_token']
    const challenge = q['hub.challenge']

    if (mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return reply.code(200).type('text/plain').send(challenge)
    }
    return reply.code(403).send({ error: 'Verification failed', code: 'INVALID_SIGNATURE', statusCode: 403 })
  })

  app.post('/whatsapp', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined
    const raw = request.rawBody

    const signatureOk = isWebhookSignatureValid(raw, signature)
    if (!signatureOk) {
      app.log.warn(
        {
          hasRawBody: !!raw,
          rawBodyBytes: raw?.length ?? 0,
          hasSignatureHeader: !!signature,
          skipSignature: config.WEBHOOK_SKIP_SIGNATURE,
        },
        'webhook signature verification failed',
      )
      return reply
        .code(403)
        .send({ error: 'Invalid signature', code: 'INVALID_SIGNATURE', statusCode: 403 })
    }

    if (!signature && config.WEBHOOK_SKIP_SIGNATURE) {
      app.log.warn('webhook accepted without x-hub-signature-256 (WEBHOOK_SKIP_SIGNATURE)')
    }

    // Ack immediately, then process out of band. Never let processing crash the route.
    reply.code(200).send({ received: true })

    setImmediate(() => {
      processWebhookPayload(app, request.body as unknown).catch((err) => {
        app.log.error({ err }, 'webhook processing failed')
      })
    })
  })
}

/** Meta Cloud API sends x-hub-signature-256; relays (e.g. Chakra) often do not. */
export function isWebhookSignatureValid(
  raw: Buffer | undefined,
  signature: string | undefined,
): boolean {
  if (!raw) return false
  if (signature) return verifySignature(raw, signature)
  return !!config.WEBHOOK_SKIP_SIGNATURE && !isProd
}

export function verifySignature(raw: Buffer, signature: string | undefined): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false
  const expected = createHmac('sha256', config.WHATSAPP_APP_SECRET)
    .update(raw)
    .digest('hex')
  const provided = signature.slice('sha256='.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
