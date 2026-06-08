import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { config, isProd } from '../config.js'
import { persistWebhookPayload, processWebhookEvent } from '../services/webhook-inbox.js'
import { secureCompareStrings } from '../utils/secure-compare.js'

/**
 * WhatsApp webhook.
 *
 * GET  -> verification handshake (hub.challenge)
 * POST -> verify signature over the RAW body (Meta x-hub-signature-256 or Chakra
 *         X-Chakra-Signature-256), ack 200 immediately, then process async.
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

    // Was: `token === verifyToken` — replaced with constant-time compare.
    if (
      mode === 'subscribe' &&
      token &&
      challenge &&
      secureCompareStrings(token, config.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    ) {
      return reply.code(200).type('text/plain').send(challenge)
    }
    return reply.code(403).send({ error: 'Verification failed', code: 'INVALID_SIGNATURE', statusCode: 403 })
  })

  app.post('/whatsapp', async (request, reply) => {
    const metaSignature = request.headers['x-hub-signature-256'] as string | undefined
    const chakraSignature = request.headers['x-chakra-signature-256'] as string | undefined
    const raw = request.rawBody

    const signatureOk = isWebhookSignatureValid(raw, metaSignature, chakraSignature)
    if (!signatureOk) {
      app.log.warn(
        {
          hasRawBody: !!raw,
          rawBodyBytes: raw?.length ?? 0,
          hasMetaSignatureHeader: !!metaSignature,
          hasChakraSignatureHeader: !!chakraSignature,
          hasChakraSecret: !!config.CHAKRA_WEBHOOK_HMAC_SECRET,
          skipSignature: config.WEBHOOK_SKIP_SIGNATURE,
        },
        'webhook signature verification failed',
      )
      return reply
        .code(403)
        .send({ error: 'Invalid signature', code: 'INVALID_SIGNATURE', statusCode: 403 })
    }

    if (!metaSignature && !chakraSignature && config.WEBHOOK_SKIP_SIGNATURE) {
      app.log.warn('webhook accepted without signature headers (WEBHOOK_SKIP_SIGNATURE)')
    }

    // Was: 200 before DB — events lost on crash. Now persist first, then ack, then process.
    const eventId = await persistWebhookPayload(request.body as unknown)
    reply.code(200).send({ received: true })

    setImmediate(() => {
      processWebhookEvent(app, eventId, request.body as unknown).catch((err) => {
        app.log.error({ err, eventId }, 'webhook processing failed')
      })
    })
  })
}

/**
 * Meta x-hub-signature-256, or Chakra X-Chakra-Signature-256 when configured.
 * Chakra relay is checked first when both header + secret are present — passthrough
 * may forward Meta's header while re-signing the (possibly re-serialized) body.
 */
export function isWebhookSignatureValid(
  raw: Buffer | undefined,
  metaSignature: string | undefined,
  chakraSignature?: string | undefined,
): boolean {
  if (!raw) return false
  if (chakraSignature && config.CHAKRA_WEBHOOK_HMAC_SECRET) {
    return verifyChakraSignature(raw, chakraSignature, config.CHAKRA_WEBHOOK_HMAC_SECRET)
  }
  if (metaSignature) return verifyMetaSignature(raw, metaSignature)
  return !!config.WEBHOOK_SKIP_SIGNATURE && !isProd
}

export function verifyMetaSignature(raw: Buffer, signature: string | undefined): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false
  const expected = createHmac('sha256', config.WHATSAPP_APP_SECRET)
    .update(raw)
    .digest('hex')
  return timingSafeEqualHex(expected, signature.slice('sha256='.length))
}

/** Chakra sends raw hex (no sha256= prefix) in X-Chakra-Signature-256. */
export function verifyChakraSignature(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  return timingSafeEqualHex(expected, signature)
}

/** @deprecated Use verifyMetaSignature */
export const verifySignature = verifyMetaSignature

function timingSafeEqualHex(expectedHex: string, providedHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length !== 64) return false
  const a = Buffer.from(expectedHex, 'hex')
  const b = Buffer.from(providedHex, 'hex')
  return timingSafeEqual(a, b)
}
