import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { enqueueJob } from '../services/jobs.js'
import { errors } from '../utils/errors.js'
import { isMediaMessageType, waMediaIdFromMetadata } from '../utils/wa-media.js'
import { whatsapp } from '../services/whatsapp.js'
import { attachReplyPreviews } from '../utils/message-shape.js'

const EDIT_WINDOW_MS = 15 * 60 * 1000

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

    // Latest inbound message -> single WhatsApp read receipt.
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
        // Non-fatal: still clear local unread state.
        app.log.warn({ err }, 'markAsRead failed upstream')
      }
    }

    // Absolute reset avoids decrement race conditions.
    await db
      .update(conversations)
      .set({ unreadCount: 0 })
      .where(eq(conversations.id, conversationId))

    app.io
      .to(`conversation:${conversationId}`)
      .emit('message_status', { conversationId, status: 'read', scope: 'inbound' })
    app.io.emit('inbox_updated', { conversationId, unreadCount: 0 })

    return { ok: true, unreadCount: 0 }
  })

  // POST /api/messages/:conversationId/unread — local inbox flag (WhatsApp-style mark unread).
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

  // PATCH /api/messages/:messageId — inbox-only text correction (WhatsApp Cloud API has no edit).
  app.patch('/:messageId', async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params)
    const { body } = z.object({ body: z.string().min(1).max(4096) }).parse(request.body)

    const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) })
    if (!msg) throw errors.notFound('Message not found')
    if (msg.deletedAt) throw errors.validation('Message was deleted')
    if (msg.direction !== 'outbound' || msg.type !== 'text') {
      throw errors.validation('Only outbound text messages can be edited')
    }
    const age = Date.now() - msg.sentAt.getTime()
    if (age > EDIT_WINDOW_MS) {
      throw errors.validation('Edit window expired (15 minutes)')
    }

    const [updated] = await db
      .update(messages)
      .set({ body, editedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning()

    const shaped = (await attachReplyPreviews([updated]))[0]
    app.io.to(`conversation:${msg.conversationId}`).emit('message_updated', {
      conversationId: msg.conversationId,
      message: shaped,
    })

    return { message: shaped }
  })

  // DELETE /api/messages/:messageId — revoke on WhatsApp + soft-delete locally.
  app.delete('/:messageId', async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params)

    const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) })
    if (!msg) throw errors.notFound('Message not found')
    if (msg.deletedAt) return { ok: true }
    if (msg.direction !== 'outbound') {
      throw errors.validation('Only messages you sent can be deleted')
    }
    if (!msg.waMessageId) {
      throw errors.validation('Message is not on WhatsApp yet')
    }

    try {
      await whatsapp.deleteMessage(app.log, msg.waMessageId)
    } catch (err) {
      app.log.warn({ err, messageId }, 'whatsapp_delete_failed')
      throw errors.whatsappApi('Could not delete message on WhatsApp')
    }

    const [updated] = await db
      .update(messages)
      .set({ deletedAt: new Date(), body: null })
      .where(eq(messages.id, messageId))
      .returning()

    app.io.to(`conversation:${msg.conversationId}`).emit('message_deleted', {
      conversationId: msg.conversationId,
      messageId: updated.id,
    })

    return { ok: true, messageId: updated.id }
  })
}
