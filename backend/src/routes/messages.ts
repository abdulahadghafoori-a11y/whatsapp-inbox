import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { enqueueJob } from '../services/jobs.js'
import { errors } from '../utils/errors.js'
import { isMediaMessageType, waMediaIdFromMetadata } from '../utils/wa-media.js'
import { whatsapp } from '../services/whatsapp.js'
import {
  emitMessageStatus,
} from '../services/socket-events.js'

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // POST /api/messages/media/:messageId/retry — re-download from WhatsApp → S3
  app.post('/media/:messageId/retry', async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params)

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    })
    if (!msg) throw errors.notFound('Message not found')
    if (!isMediaMessageType(msg.type)) {
      throw errors.validation('Not a media message')
    }

    const waMediaId = waMediaIdFromMetadata(msg.metadata, msg.type)
    if (!waMediaId) {
      throw errors.validation('No WhatsApp media id stored for this message')
    }

    await db
      .update(messages)
      .set({ mediaStatus: 'pending', mediaUrl: null })
      .where(eq(messages.id, messageId))

    await enqueueJob('download_media', {
      messageId: msg.id,
      conversationId: msg.conversationId,
      waMediaId,
      mimeType: msg.mediaMimeType ?? 'application/octet-stream',
      filename: msg.mediaFilename ?? 'upload',
    })

    return { ok: true }
  })

  // POST /api/messages/:conversationId/read
  app.post('/:conversationId/read', async (request) => {
    const { conversationId } = z
      .object({ conversationId: z.string().uuid() })
      .parse(request.params)

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    })
    if (!conversation) throw errors.conversationNotFound()

    const latestInbound = await db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, 'inbound'),
      ),
      orderBy: desc(messages.sentAt),
    })

    if (latestInbound?.waMessageId) {
      try {
        await whatsapp.markAsRead(app.log, latestInbound.waMessageId)
      } catch (err) {
        app.log.warn({ err }, 'markAsRead failed upstream')
      }
    }

    await db
      .update(conversations)
      .set({ unreadCount: 0 })
      .where(eq(conversations.id, conversationId))

    emitMessageStatus(app.io, {
      conversationId,
      status: 'read',
      scope: 'inbound',
    })
    app.io.emit('inbox_updated', { conversationId, unreadCount: 0 })

    return { ok: true, unreadCount: 0 }
  })

  // POST /api/messages/:conversationId/unread
  app.post('/:conversationId/unread', async (request) => {
    const { conversationId } = z
      .object({ conversationId: z.string().uuid() })
      .parse(request.params)

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: { id: true },
    })
    if (!conversation) throw errors.conversationNotFound()

    const [row] = await db
      .update(conversations)
      .set({ unreadCount: 1 })
      .where(eq(conversations.id, conversationId))
      .returning({ unreadCount: conversations.unreadCount })

    app.io.emit('inbox_updated', { conversationId, unreadCount: row?.unreadCount ?? 1 })

    return { ok: true, unreadCount: row?.unreadCount ?? 1 }
  })
}
