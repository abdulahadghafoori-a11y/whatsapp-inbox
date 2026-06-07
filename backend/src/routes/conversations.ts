import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  conversations,
  contacts,
  messages,
  teamMembers,
  conversationEvents,
  conversationTags,
  tags,
  type Conversation,
} from '../db/schema.js'
import { errors } from '../utils/errors.js'
import {
  emitConversationAssigned,
  emitConversationUpdated,
} from '../services/socket-events.js'
import { enqueueJob } from '../services/jobs.js'
import {
  createOutboundLocation,
  createOutboundTemplate,
  createOutboundText,
  resendOutboundMessage,
} from '../services/outbound.js'
import { resolveMessagingState, shapeMessagingFields } from '../utils/messaging-windows.js'
import { attachReplyPreviews } from '../utils/message-shape.js'
import {
  sendOutboundMediaBuffer,
  sendOutboundMediaFromS3Key,
} from '../services/outbound-media-buffer.js'
import { voiceNoteFromMime } from '../utils/stored-media.js'
import { forwardMessageToConversation } from '../services/forward-message.js'
import { resolveReplyTargets } from '../utils/resolve-reply.js'

const PAGE = 30

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // POST /api/conversations/forward-batch
  app.post('/forward-batch', async (request, reply) => {
    const { messageId, targetConversationIds } = z
      .object({
        messageId: z.string().uuid(),
        targetConversationIds: z.array(z.string().uuid()).min(1).max(30),
      })
      .parse(request.body)

    const results: Array<{
      conversationId: string
      ok: boolean
      message?: Awaited<ReturnType<typeof forwardMessageToConversation>>
      error?: string
    }> = []

    for (const targetConversationId of targetConversationIds) {
      try {
        const message = await forwardMessageToConversation(app, {
          sourceMessageId: messageId,
          targetConversationId,
          sentBy: request.agent.id,
        })
        results.push({ conversationId: targetConversationId, ok: true, message })
      } catch (err) {
        results.push({
          conversationId: targetConversationId,
          ok: false,
          error: err instanceof Error ? err.message : 'Forward failed',
        })
      }
    }

    const okCount = results.filter((r) => r.ok).length
    return reply.code(okCount > 0 ? 201 : 400).send({ results, okCount })
  })

  // GET /api/conversations
  app.get('/', async (request) => {
    const q = z
      .object({
        status: z.enum(['open', 'resolved', 'pending', 'all']).default('all'),
        assignedTo: z.string().optional(), // uuid | 'me'
        search: z.string().optional(),
        cursor: z.string().datetime().optional(),
      })
      .parse(request.query)

    const conds = [isNull(conversations.deletedAt)]
    if (q.status !== 'all') conds.push(eq(conversations.status, q.status))
    if (q.assignedTo === 'me') conds.push(eq(conversations.assignedTo, request.agent.id))
    else if (q.assignedTo) conds.push(eq(conversations.assignedTo, q.assignedTo))
    if (q.search) {
      const term = `%${q.search}%`
      conds.push(
        or(
          ilike(contacts.name, term),
          ilike(contacts.waId, term),
          ilike(conversations.lastMessagePreview, term),
          ilike(conversations.ctwaClid, term),
        )!,
      )
    }
    if (q.cursor) conds.push(lt(conversations.lastMessageAt, new Date(q.cursor)))

    const rows = await db
      .select({
        conversation: conversations,
        contact: contacts,
        assignedName: teamMembers.name,
        assignedAvatar: teamMembers.avatarUrl,
      })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .leftJoin(teamMembers, eq(conversations.assignedTo, teamMembers.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(
        desc(sql`(CASE WHEN ${conversations.pinnedAt} IS NOT NULL THEN 1 ELSE 0 END)`),
        desc(conversations.pinnedAt),
        desc(conversations.lastMessageAt),
      )
      .limit(PAGE + 1)

    const hasMore = rows.length > PAGE
    const page = rows.slice(0, PAGE)
    const last = page[page.length - 1]?.conversation.lastMessageAt

    return {
      conversations: page.map((r) => shape(r.conversation, r.contact, r.assignedName, r.assignedAvatar)),
      nextCursor: hasMore && last ? last.toISOString() : null,
    }
  })

  // GET /api/conversations/:id
  app.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const row = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: { contact: true, assignedAgent: true },
    })
    if (!row || !row.contact) throw errors.conversationNotFound()
    return {
      conversation: {
        ...shape(
          row,
          row.contact,
          row.assignedAgent?.name ?? null,
          row.assignedAgent?.avatarUrl ?? null,
        ),
        notes: row.notes,
        ctwaClid: row.ctwaClid,
        referralSourceUrl: row.referralSourceUrl,
        referralSourceType: row.referralSourceType,
        adId: row.adId,
        adTitle: row.adTitle,
        adBody: row.adBody,
        referralMetadata: row.referralMetadata,
        handoffReason: row.handoffReason,
      },
    }
  })

  // PATCH /api/conversations/:id
  app.patch('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z
      .object({
        status: z.enum(['open', 'resolved', 'pending']).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        notes: z.string().optional(),
        pinned: z.boolean().optional(),
      })
      .parse(request.body)

    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
    if (!existing) throw errors.conversationNotFound()

    const patch: Partial<Conversation> = {}
    if (body.status !== undefined) {
      patch.status = body.status
      // Track resolution time for SLA reporting; clear it when reopened.
      patch.resolvedAt = body.status === 'resolved' ? new Date() : null
    }
    if (body.assignedTo !== undefined) patch.assignedTo = body.assignedTo
    if (body.notes !== undefined) patch.notes = body.notes
    if (body.pinned !== undefined) {
      patch.pinnedAt = body.pinned ? new Date() : null
    }

    await db.update(conversations).set(patch).where(eq(conversations.id, id))

    // Audit + side effects.
    if (body.status && body.status !== existing.status) {
      // Was: any non-resolved status logged as 'reopened' (wrong for open->pending).
      const type =
        body.status === 'resolved'
          ? 'resolved'
          : existing.status === 'resolved'
            ? 'reopened'
            : 'status_changed'
      await db.insert(conversationEvents).values({
        conversationId: id,
        actorId: request.agent.id,
        type,
        payload: { from: existing.status, to: body.status },
      })
    }
    if (body.assignedTo !== undefined && body.assignedTo !== existing.assignedTo) {
      if (body.assignedTo) {
        await db.insert(conversationEvents).values({
          conversationId: id,
          actorId: request.agent.id,
          type: 'assigned',
          payload: { from: existing.assignedTo, assignedTo: body.assignedTo },
        })
        emitConversationAssigned(app.io, id, body.assignedTo)
        await enqueueJob('send_push_notification', {
          agentId: body.assignedTo,
          title: 'Conversation assigned to you',
          body: existing.lastMessagePreview ?? 'New conversation',
          data: { conversationId: id },
        })
      } else {
        // Was: unassign (assignedTo -> null) left no audit trail.
        await db.insert(conversationEvents).values({
          conversationId: id,
          actorId: request.agent.id,
          type: 'unassigned',
          payload: { from: existing.assignedTo },
        })
      }
    }
    if (body.notes !== undefined && body.notes !== (existing.notes ?? '')) {
      await db.insert(conversationEvents).values({
        conversationId: id,
        actorId: request.agent.id,
        type: 'note_updated',
        // Store a diff so the audit log shows what changed.
        payload: { from: existing.notes ?? null, to: body.notes },
      })
    }

    emitConversationUpdated(app.io, id)
    const row = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: { contact: true, assignedAgent: true },
    })
    if (!row?.contact) throw errors.conversationNotFound()
    return {
      conversation: {
        ...shape(
          row,
          row.contact,
          row.assignedAgent?.name ?? null,
          row.assignedAgent?.avatarUrl ?? null,
        ),
        notes: row.notes,
        ctwaClid: row.ctwaClid,
        referralSourceUrl: row.referralSourceUrl,
        referralSourceType: row.referralSourceType,
        adId: row.adId,
        adTitle: row.adTitle,
        adBody: row.adBody,
        referralMetadata: row.referralMetadata,
        handoffReason: row.handoffReason,
      },
    }
  })

  // DELETE /api/conversations/:id  — soft delete (hidden from inbox, retained).
  app.delete('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
    if (!existing) throw errors.conversationNotFound()
    await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, id))
    await db.insert(conversationEvents).values({
      conversationId: id,
      actorId: request.agent.id,
      type: 'deleted',
    })
    emitConversationUpdated(app.io, id)
    return reply.code(200).send({ ok: true })
  })

  // GET /api/conversations/:id/tags
  app.get('/:id/tags', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const rows = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(eq(conversationTags.conversationId, id))
    return { tags: rows }
  })

  // POST /api/conversations/:id/tags  { tagId }
  app.post('/:id/tags', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { tagId } = z.object({ tagId: z.string().uuid() }).parse(request.body)
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
    if (!conversation) throw errors.conversationNotFound()
    const tag = await db.query.tags.findFirst({ where: eq(tags.id, tagId) })
    if (!tag) throw errors.notFound('Tag not found.')
    await db
      .insert(conversationTags)
      .values({ conversationId: id, tagId })
      .onConflictDoNothing()
    emitConversationUpdated(app.io, id)
    return reply.code(201).send({ ok: true })
  })

  // DELETE /api/conversations/:id/tags/:tagId
  app.delete('/:id/tags/:tagId', async (request) => {
    const { id, tagId } = z
      .object({ id: z.string().uuid(), tagId: z.string().uuid() })
      .parse(request.params)
    await db
      .delete(conversationTags)
      .where(
        and(eq(conversationTags.conversationId, id), eq(conversationTags.tagId, tagId)),
      )
    emitConversationUpdated(app.io, id)
    return { ok: true }
  })

  // GET /api/conversations/:id/messages  (cursor pagination, oldest first)
  app.get('/:id/messages', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const q = z
      .object({
        before: z.string().uuid().optional(),
        /** In-conversation message search (body text). */
        q: z.string().max(200).optional(),
      })
      .parse(request.query)

    const searchTerm = q.q?.trim()
    if (searchTerm) {
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.conversationId, id), ilike(messages.body, `%${searchTerm}%`)),
        )
        .orderBy(desc(messages.sentAt))
        .limit(50)
      const ordered = rows.slice().reverse()
      return {
        messages: await attachReplyPreviews(ordered),
        nextCursor: null,
      }
    }

    let beforeSentAt: Date | undefined
    if (q.before) {
      const cursorMsg = await db.query.messages.findFirst({
        where: eq(messages.id, q.before),
      })
      beforeSentAt = cursorMsg?.sentAt
    }

    const conds = [eq(messages.conversationId, id)]
    if (beforeSentAt) conds.push(lt(messages.sentAt, beforeSentAt))

    // Fetch newest page then return oldest-first for rendering.
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(desc(messages.sentAt))
      .limit(PAGE + 1)

    const hasMore = rows.length > PAGE
    const page = rows.slice(0, PAGE)
    const ordered = page.slice().reverse()
    return {
      messages: await attachReplyPreviews(ordered),
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
    }
  })

  // POST /api/conversations/:id/messages  (rate limited per agent)
  app.post(
    '/:id/messages',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => (req as typeof req & { agent?: { id: string } }).agent?.id ?? req.ip,
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { contact: true },
      })
      if (!conversation || !conversation.contact) throw errors.conversationNotFound()

      if (!resolveMessagingState(conversation).canSendSession) {
        throw errors.windowExpired()
      }

      const contentType = request.headers['content-type'] ?? ''

      // JSON: text or audio (base64 — avoids multipart corruption on mobile).
      if (contentType.includes('application/json')) {
        const body = z
          .discriminatedUnion('type', [
            z.object({
              type: z.literal('text'),
              body: z.string().min(1),
              replyToMessageId: z.string().uuid().optional(),
            }),
            z.object({
              type: z.literal('audio'),
              filename: z.string().min(1),
              mimeType: z.string().min(1),
              data: z.string().min(100),
              caption: z.string().optional(),
              replyToMessageId: z.string().uuid().optional(),
            }),
            z.object({
              type: z.literal('location'),
              latitude: z.number().min(-90).max(90),
              longitude: z.number().min(-180).max(180),
              name: z.string().max(256).optional(),
              address: z.string().max(512).optional(),
              replyToMessageId: z.string().uuid().optional(),
            }),
            z.object({
              type: z.literal('media_reuse'),
              reuseS3Key: z.string().min(1),
              filename: z.string().min(1),
              mimeType: z.string().min(1),
              caption: z.string().optional(),
              replyToMessageId: z.string().uuid().optional(),
            }),
          ])
          .parse(request.body)

        if (body.type === 'media_reuse') {
          if (!body.reuseS3Key.startsWith('media/')) {
            throw errors.validation('Invalid media key.')
          }
          // Authorization: the key must belong to an existing message attachment.
          // Was: only the `media/` prefix was checked, so any agent could send any
          // arbitrary S3 object under that prefix (IDOR). Mirrors the presign check
          // in routes/media.ts.
          const owningMessage = await db.query.messages.findFirst({
            where: eq(messages.mediaUrl, body.reuseS3Key),
            columns: { id: true },
          })
          if (!owningMessage) {
            throw errors.forbidden('Media key is not available for reuse.')
          }
          const replyCtx = await resolveReplyTargets(id, body.replyToMessageId)
          const message = await sendOutboundMediaFromS3Key(app, {
            conversationId: id,
            contactWaId: conversation.contact.waId,
            s3Key: body.reuseS3Key,
            filename: body.filename,
            mimeType: body.mimeType,
            caption: body.caption,
            sentBy: request.agent.id,
            replyToMessageId: replyCtx.replyToMessageId,
            replyToWaMessageId: replyCtx.replyToWaMessageId,
            passthrough: true,
          })
          const shaped = (await attachReplyPreviews([message]))[0]
          return reply.code(201).send({ message: shaped })
        }

        if (body.type === 'location') {
          const replyCtx = await resolveReplyTargets(id, body.replyToMessageId)
          const raw = await createOutboundLocation(app.io, {
            conversationId: id,
            to: conversation.contact.waId,
            latitude: body.latitude,
            longitude: body.longitude,
            name: body.name,
            address: body.address,
            sentBy: request.agent.id,
            replyToMessageId: replyCtx.replyToMessageId,
            replyToWaMessageId: replyCtx.replyToWaMessageId,
          })
          const message = (await attachReplyPreviews([raw]))[0]
          return reply.code(201).send({ message })
        }

        if (body.type === 'audio') {
          const buffer = Buffer.from(body.data.replace(/\s/g, ''), 'base64')
          if (buffer.length < 200) {
            throw errors.validation('Recording is too short or empty.')
          }
          const replyCtx = await resolveReplyTargets(id, body.replyToMessageId)
          const message = await sendOutboundMediaBuffer(app, {
            conversationId: id,
            contactWaId: conversation.contact.waId,
            buffer,
            filename: body.filename,
            mimeHint: body.mimeType,
            caption: body.caption,
            sentBy: request.agent.id,
            replyToMessageId: replyCtx.replyToMessageId,
            replyToWaMessageId: replyCtx.replyToWaMessageId,
          })
          const shaped = (await attachReplyPreviews([message]))[0]
          return reply.code(201).send({ message: shaped })
        }

        const replyCtx = await resolveReplyTargets(id, body.replyToMessageId)

        const raw = await createOutboundText(app.io, {
          conversationId: id,
          to: conversation.contact.waId,
          body: body.body,
          sentBy: request.agent.id,
          replyToMessageId: replyCtx.replyToMessageId,
          replyToWaMessageId: replyCtx.replyToWaMessageId,
        })
        const message = (await attachReplyPreviews([raw]))[0]
        return reply.code(201).send({ message })
      }

      // Media message (multipart).
      const file = await request.file()
      if (!file) throw errors.validation('No file or unsupported content type.')
      const buffer = await file.toBuffer()
      const caption = (file.fields?.caption as { value?: string } | undefined)?.value
      const replyToMessageId = (
        file.fields?.replyToMessageId as { value?: string } | undefined
      )?.value
      const replyCtx = await resolveReplyTargets(id, replyToMessageId)

      const raw = await sendOutboundMediaBuffer(app, {
        conversationId: id,
        contactWaId: conversation.contact.waId,
        buffer,
        filename: file.filename,
        mimeHint: file.mimetype,
        caption,
        sentBy: request.agent.id,
        replyToMessageId: replyCtx.replyToMessageId,
        replyToWaMessageId: replyCtx.replyToWaMessageId,
      })
      const message = (await attachReplyPreviews([raw]))[0]
      return reply.code(201).send({ message })
    },
  )

  // POST /api/conversations/:id/forward — send an existing message to another chat
  app.post('/:id/forward', async (request, reply) => {
    const { id: targetConversationId } = z.object({ id: z.string().uuid() }).parse(request.params)
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.body)

    const message = await forwardMessageToConversation(app, {
      sourceMessageId: messageId,
      targetConversationId,
      sentBy: request.agent.id,
    })
    return reply.code(201).send({ message })
  })

  // POST /api/conversations/:id/messages/:messageId/resend
  app.post('/:id/messages/:messageId/resend', async (request, reply) => {
    const { id, messageId } = z
      .object({ id: z.string().uuid(), messageId: z.string().uuid() })
      .parse(request.params)

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: { contact: true },
    })
    if (!conversation?.contact) throw errors.conversationNotFound()

    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.conversationId, id)),
    })
    if (!message) throw errors.notFound('Message not found')
    if (message.direction !== 'outbound' || message.status !== 'failed') {
      throw errors.validation('Only failed outbound messages can be resent')
    }

    if (message.type !== 'text' && !message.mediaUrl) {
      throw errors.validation('Message media is missing')
    }

    const voiceNote =
      message.type === 'audio' &&
      !!message.mediaMimeType &&
      voiceNoteFromMime(message.mediaMimeType)

    const updated = await resendOutboundMessage(app.io, message, conversation.contact.waId, {
      s3Key: message.mediaUrl ?? undefined,
      voiceNote,
    })
    return reply.send({ message: updated })
  })

  // POST /api/conversations/:id/messages/template  (works when window is closed)
  app.post('/:id/messages/template', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z
      .object({
        templateName: z.string().min(1),
        languageCode: z.string().min(1),
        components: z.array(z.any()).optional(),
      })
      .parse(request.body)

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: { contact: true },
    })
    if (!conversation || !conversation.contact) throw errors.conversationNotFound()

    const message = await createOutboundTemplate(app.io, {
      conversationId: id,
      to: conversation.contact.waId,
      templateName: body.templateName,
      languageCode: body.languageCode,
      components: body.components,
      sentBy: request.agent.id,
    })
    return reply.code(201).send({ message })
  })
}

function shape(
  c: Conversation,
  contact: { id: string; waId: string; name: string | null; profilePictureUrl: string | null },
  assignedName: string | null,
  assignedAvatar: string | null,
) {
  return {
    id: c.id,
    status: c.status,
    contact: {
      id: contact.id,
      waId: contact.waId,
      name: contact.name,
      profilePictureUrl: contact.profilePictureUrl,
    },
    assignedTo: c.assignedTo,
    assignedAgent: c.assignedTo ? { name: assignedName, avatarUrl: assignedAvatar } : null,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageId: c.lastMessageId,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageStatus: c.lastMessageStatus,
    lastMessageType: c.lastMessageType,
    pinnedAt: c.pinnedAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    aiHandled: c.aiHandled,
    ...shapeMessagingFields(c),
  }
}
