import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq, ilike, isNull, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, contacts, messages } from '../db/schema.js'
import { enqueueJob } from '../services/jobs.js'
import { errors } from '../utils/errors.js'
import { isMediaMessageType, waMediaIdFromMetadata } from '../utils/wa-media.js'
import { whatsapp } from '../services/whatsapp.js'
import {
  emitMessageStatus,
} from '../services/socket-events.js'

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /api/messages/search?q=...  — global message-content search across all
  // (non-deleted) conversations. Returns matches with conversation/contact context.
  app.get('/search', async (request) => {
    const q = z
      .object({
        q: z.string().trim().min(1).max(200),
        cursor: z.string().datetime().optional(),
      })
      .parse(request.query)

    const term = `%${q.q}%`
    const conds = [ilike(messages.body, term), isNull(conversations.deletedAt)]
    if (q.cursor) conds.push(lt(messages.sentAt, new Date(q.cursor)))

    const PAGE = 30
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        body: messages.body,
        direction: messages.direction,
        type: messages.type,
        sentAt: messages.sentAt,
        contactName: contacts.name,
        contactWaId: contacts.waId,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(and(...conds))
      .orderBy(desc(messages.sentAt))
      .limit(PAGE + 1)

    const hasMore = rows.length > PAGE
    const page = rows.slice(0, PAGE)
    const last = page[page.length - 1]?.sentAt
    return {
      results: page.map((r) => ({
        messageId: r.id,
        conversationId: r.conversationId,
        body: r.body,
        direction: r.direction,
        type: r.type,
        sentAt: r.sentAt,
        contactName: r.contactName ?? r.contactWaId,
        contactWaId: r.contactWaId,
      })),
      nextCursor: hasMore && last ? last.toISOString() : null,
    }
  })

  // POST /api/messages/media/:messageId/retry — re-download from WhatsApp → S3
  app.post('/media/:messageId/retry', async (request) => {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params)

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    })
    if (!msg) throw errors.notFound('Message not found')

    const conversation = await db.query.conversations.findFirst({
      where: and(eq(conversations.id, msg.conversationId), isNull(conversations.deletedAt)),
      columns: { id: true },
    })
    if (!conversation) throw errors.conversationNotFound()
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
      where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)),
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
      where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)),
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
