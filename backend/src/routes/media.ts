import type { FastifyInstance } from 'fastify'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { config } from '../config.js'
import { errors } from '../utils/errors.js'
import { getBlobBySha256, setBlobThumbhash } from '../services/media-blobs.js'
import { emitMediaThumbhash } from '../services/socket-events.js'

/** Presigned GET TTL returned to clients (keep mobile cache refresh inside this window). */
export const MEDIA_PRESIGN_EXPIRES_SEC = 3600

const presignItemSchema = z.object({
  key: z.string().min(1),
  messageId: z.string().uuid(),
})

/** Public CDN base only — never append S3 presigned query params (incompatible with most CDNs). */
function presignedWithOptionalCdn(presigned: string, key: string): string {
  const cdn = config.STORAGE_CDN_PUBLIC_BASE
  if (!cdn) return presigned
  return `${cdn.replace(/\/$/, '')}/${key}`
}

async function presignAuthorizedKey(
  app: FastifyInstance,
  key: string,
  messageId: string,
): Promise<{ url: string; expiresAt: string } | null> {
  if (!key.startsWith('media/')) return null

  const row = await db
    .select({ id: messages.id, mediaUrl: messages.mediaUrl, mediaThumbUrl: messages.mediaThumbUrl })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.id, messageId), isNull(conversations.deletedAt)))
    .limit(1)
  if (row.length === 0) return null
  const allowed = row[0]!
  if (key !== allowed.mediaUrl && key !== allowed.mediaThumbUrl) return null

  const expiresIn = MEDIA_PRESIGN_EXPIRES_SEC
  const presigned = await app.s3.getPresignedUrl(key, expiresIn)
  const url = presignedWithOptionalCdn(presigned, key)
  return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }
}

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // POST /api/media/batch — presign many keys in one round-trip (mobile viewport batching).
  app.post('/batch', async (request) => {
    const body = z
      .object({
        items: z.array(presignItemSchema).min(1).max(30),
      })
      .parse(request.body)

    const uniqueIds = [...new Set(body.items.map((i) => i.messageId))]
    const rows =
      uniqueIds.length === 0
        ? []
        : await db
            .select({
              id: messages.id,
              mediaUrl: messages.mediaUrl,
              mediaThumbUrl: messages.mediaThumbUrl,
            })
            .from(messages)
            .innerJoin(conversations, eq(messages.conversationId, conversations.id))
            .where(and(inArray(messages.id, uniqueIds), isNull(conversations.deletedAt)))

    // Authorize against both the full and thumb keys; presign in-memory (no N+1 DB calls).
    const allowed = new Map(rows.map((r) => [r.id, r]))
    const seen = new Set<string>()
    const expiresIn = MEDIA_PRESIGN_EXPIRES_SEC
    const urls: Array<{ key: string; messageId: string; url: string; expiresAt: string }> = []

    for (const item of body.items) {
      const dedupe = `${item.messageId}\0${item.key}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)

      if (!item.key.startsWith('media/')) continue
      const row = allowed.get(item.messageId)
      if (!row || (item.key !== row.mediaUrl && item.key !== row.mediaThumbUrl)) continue

      const presigned = await app.s3.getPresignedUrl(item.key, expiresIn)
      urls.push({
        key: item.key,
        messageId: item.messageId,
        url: presignedWithOptionalCdn(presigned, item.key),
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      })
    }

    return { urls }
  })

  // POST /api/media/:sha256/thumbhash — the first client to decode a blob registers
  // its ThumbHash so every other device paints an instant placeholder. First write wins.
  app.post('/:sha256/thumbhash', async (request) => {
    const { sha256 } = z
      .object({ sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid content hash.') })
      .parse(request.params)
    const body = z
      .object({
        thumbhash: z.string().min(1).max(256),
        messageId: z.string().uuid(),
        width: z.coerce.number().int().positive().max(100_000).optional(),
        height: z.coerce.number().int().positive().max(100_000).optional(),
      })
      .parse(request.body)

    const blob = await getBlobBySha256(sha256)
    if (!blob) throw errors.notFound('Media not found.')

    // Authorize: the message must reference this exact blob in a live conversation.
    const row = await db
      .select({
        conversationId: messages.conversationId,
        mediaUrl: messages.mediaUrl,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(messages.id, body.messageId), isNull(conversations.deletedAt)))
      .limit(1)
    if (row.length === 0 || row[0]!.mediaUrl !== blob.storageKey) {
      throw errors.forbidden('Media not found for this message.')
    }

    if (!blob.thumbhash) {
      await setBlobThumbhash(sha256, {
        thumbhash: body.thumbhash,
        width: body.width,
        height: body.height,
      })
      emitMediaThumbhash(app.io, row[0]!.conversationId, body.messageId, body.thumbhash, {
        width: body.width ?? blob.width ?? null,
        height: body.height ?? blob.height ?? null,
      })
    }

    return { ok: true }
  })

  // GET /api/media/*?messageId=<uuid>
  // Was: any JWT + guessed S3 key could presign — now key must match the message row.
  app.get('/*', async (request) => {
    const key = (request.params as Record<string, string>)['*']
    z.string().min(1).parse(key)
    if (!key.startsWith('media/')) throw errors.forbidden('Invalid media key.')

    const q = z.object({ messageId: z.string().uuid() }).parse(request.query)

    const signed = await presignAuthorizedKey(app, key, q.messageId)
    if (!signed) throw errors.forbidden('Media not found for this message.')
    return signed
  })
}
