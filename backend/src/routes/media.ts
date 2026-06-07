import type { FastifyInstance } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { config } from '../config.js'
import { errors } from '../utils/errors.js'

/** Presigned GET TTL returned to clients (keep mobile cache refresh inside this window). */
export const MEDIA_PRESIGN_EXPIRES_SEC = 3600

/** Public CDN base only — never append S3 presigned query params (incompatible with most CDNs). */
function presignedWithOptionalCdn(presigned: string, key: string): string {
  const cdn = config.STORAGE_CDN_PUBLIC_BASE
  if (!cdn) return presigned
  return `${cdn.replace(/\/$/, '')}/${key}`
}

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/media/*?messageId=<uuid>
  // Was: any JWT + guessed S3 key could presign — now key must match the message row.
  app.get('/*', async (request) => {
    const key = (request.params as Record<string, string>)['*']
    z.string().min(1).parse(key)
    if (!key.startsWith('media/')) throw errors.forbidden('Invalid media key.')

    const q = z.object({ messageId: z.string().uuid() }).parse(request.query)

    const row = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(messages.id, q.messageId),
          eq(messages.mediaUrl, key),
          isNull(conversations.deletedAt),
        ),
      )
      .limit(1)
    if (row.length === 0) throw errors.forbidden('Media not found for this message.')

    const expiresIn = MEDIA_PRESIGN_EXPIRES_SEC
    const presigned = await app.s3.getPresignedUrl(key, expiresIn)
    const url = presignedWithOptionalCdn(presigned, key)
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }
  })
}
