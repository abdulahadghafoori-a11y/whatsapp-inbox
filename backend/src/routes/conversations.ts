import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  conversations,
  contacts,
  messages,
  teamMembers,
  conversationEvents,
  type Conversation,
} from '../db/schema.js'
import { errors } from '../utils/errors.js'
import { emitNewMessage } from '../services/socket-events.js'
import { enqueueJob } from '../services/jobs.js'
import {
  createOutboundText,
  createOutboundMedia,
  resendOutboundMessage,
} from '../services/outbound.js'
import { whatsapp } from '../services/whatsapp.js'
import { resolveMessagingState, shapeMessagingFields } from '../utils/messaging-windows.js'
import { tryActivateCtwaFep, loadMessagingPayload } from '../services/ctwa-fep.js'
import { attachReplyPreviews } from '../utils/message-shape.js'
import { prepareAudioForWhatsApp } from '../utils/transcode-audio.js'
import { analyzeAudioBuffer } from '../utils/inbound-audio-profile.js'
import { normalizeWhatsAppMime } from '../utils/mime-normalize.js'

const PAGE = 30
// WhatsApp media caps (stricter than the 50MB multipart limit).
const MEDIA_CAPS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  sticker: 500 * 1024,
}

function mimeToType(mime: string): 'image' | 'video' | 'audio' | 'document' | 'sticker' {
  if (mime.startsWith('image/')) return mime === 'image/webp' ? 'sticker' : 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

async function sendOutboundMediaBuffer(
  app: FastifyInstance,
  opts: {
    conversationId: string
    contactWaId: string
    buffer: Buffer
    filename: string
    mimeHint: string
    caption?: string
    sentBy: string
  },
) {
  let buffer = opts.buffer
  let filename = opts.filename
  let mime = normalizeWhatsAppMime(opts.mimeHint, opts.filename)
  let voiceNote = false

  if (mime.startsWith('audio/')) {
    const prepared = await prepareAudioForWhatsApp(buffer, filename, {
      conversationId: opts.conversationId,
      s3: app.s3,
      log: app.log,
    })
    buffer = prepared.buffer
    mime = prepared.mime.split(';')[0].trim()
    filename = prepared.filename
    voiceNote = prepared.voiceNote
    const out = analyzeAudioBuffer(buffer)
    app.log.info(
      {
        mime,
        bytes: buffer.length,
        filename,
        voiceNote,
        outputMagic: out.magic,
        sourceBytes: opts.buffer.length,
        matchedInbound: prepared.reference?.mimeType ?? null,
      },
      'outbound_audio_prepared',
    )
  }

  const type = mimeToType(mime)
  const cap = MEDIA_CAPS[type] ?? 0
  if (buffer.length > cap) throw errors.mediaTooLarge()

  const uploaded = await whatsapp.uploadMedia(app.log, buffer, mime, filename)
  const tempKey = `media/${opts.conversationId}/outbound/${Date.now()}-${filename}`
  await app.s3.uploadToS3(tempKey, buffer, mime)

  return createOutboundMedia(app.io, {
    conversationId: opts.conversationId,
    to: opts.contactWaId,
    type: type === 'sticker' ? 'sticker' : type,
    mediaId: uploaded.id,
    s3Key: tempKey,
    mimeType: mime,
    filename,
    caption: opts.caption,
    sentBy: opts.sentBy,
    voiceNote,
  })
}

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

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

    const conds = []
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
      .orderBy(desc(conversations.lastMessageAt))
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
      })
      .parse(request.body)

    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
    if (!existing) throw errors.conversationNotFound()

    const patch: Partial<Conversation> = {}
    if (body.status !== undefined) patch.status = body.status
    if (body.assignedTo !== undefined) patch.assignedTo = body.assignedTo
    if (body.notes !== undefined) patch.notes = body.notes

    await db.update(conversations).set(patch).where(eq(conversations.id, id))

    // Audit + side effects.
    if (body.status) {
      await db.insert(conversationEvents).values({
        conversationId: id,
        actorId: request.agent.id,
        type: body.status === 'resolved' ? 'resolved' : 'reopened',
      })
    }
    if (body.assignedTo !== undefined && body.assignedTo && body.assignedTo !== existing.assignedTo) {
      await db.insert(conversationEvents).values({
        conversationId: id,
        actorId: request.agent.id,
        type: 'assigned',
        payload: { assignedTo: body.assignedTo },
      })
      app.io.to(`agent:${body.assignedTo}`).emit('conversation_assigned', { conversationId: id })
      await enqueueJob('send_push_notification', {
        agentId: body.assignedTo,
        title: 'Conversation assigned to you',
        body: existing.lastMessagePreview ?? 'New conversation',
        data: { conversationId: id },
      })
    }
    if (body.notes !== undefined) {
      await db.insert(conversationEvents).values({
        conversationId: id,
        actorId: request.agent.id,
        type: 'note_updated',
      })
    }

    app.io.to(`conversation:${id}`).emit('conversation_updated', { conversationId: id })
    app.io.emit('inbox_updated', { conversationId: id })
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

  // GET /api/conversations/:id/messages  (cursor pagination, oldest first)
  app.get('/:id/messages', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const q = z.object({ before: z.string().uuid().optional() }).parse(request.query)

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
            }),
          ])
          .parse(request.body)

        if (body.type === 'audio') {
          const buffer = Buffer.from(body.data.replace(/\s/g, ''), 'base64')
          if (buffer.length < 200) {
            throw errors.validation('Recording is too short or empty.')
          }
          const message = await sendOutboundMediaBuffer(app, {
            conversationId: id,
            contactWaId: conversation.contact.waId,
            buffer,
            filename: body.filename,
            mimeHint: body.mimeType,
            caption: body.caption,
            sentBy: request.agent.id,
          })
          return reply.code(201).send({ message })
        }

        let replyToWaMessageId: string | undefined
        if (body.replyToMessageId) {
          const parent = await db.query.messages.findFirst({
            where: eq(messages.id, body.replyToMessageId),
            columns: { id: true, conversationId: true, waMessageId: true },
          })
          if (!parent || parent.conversationId !== id) {
            throw errors.validation('Reply target not found in this conversation')
          }
          if (!parent.waMessageId) {
            throw errors.validation('Reply target is not available on WhatsApp yet')
          }
          replyToWaMessageId = parent.waMessageId
        }

        const message = await createOutboundText(app.io, {
          conversationId: id,
          to: conversation.contact.waId,
          body: body.body,
          sentBy: request.agent.id,
          replyToMessageId: body.replyToMessageId,
          replyToWaMessageId,
        })
        return reply.code(201).send({ message })
      }

      // Media message (multipart).
      const file = await request.file()
      if (!file) throw errors.validation('No file or unsupported content type.')
      const buffer = await file.toBuffer()
      const caption = (file.fields?.caption as { value?: string } | undefined)?.value

      const message = await sendOutboundMediaBuffer(app, {
        conversationId: id,
        contactWaId: conversation.contact.waId,
        buffer,
        filename: file.filename,
        mimeHint: file.mimetype,
        caption,
        sentBy: request.agent.id,
      })
      return reply.code(201).send({ message })
    },
  )

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

    let mediaId: string | undefined
    let voiceNote = false
    if (message.type !== 'text') {
      if (!message.mediaUrl || !message.mediaMimeType) {
        throw errors.validation('Message media is missing')
      }
      let buffer = await app.s3.downloadFromS3(message.mediaUrl)
      let mime = normalizeWhatsAppMime(
        message.mediaMimeType,
        message.mediaFilename ?? 'upload',
      )
      let uploadName = message.mediaFilename ?? 'upload'
      if (mime.startsWith('audio/')) {
        const prepared = await prepareAudioForWhatsApp(buffer, uploadName, {
          conversationId: id,
          s3: app.s3,
          log: app.log,
        })
        buffer = prepared.buffer
        mime = prepared.mime.split(';')[0].trim()
        uploadName = prepared.filename
        voiceNote = prepared.voiceNote
      }
      const uploaded = await whatsapp.uploadMedia(app.log, buffer, mime, uploadName)
      mediaId = uploaded.id
    }

    const updated = await resendOutboundMessage(app.io, message, conversation.contact.waId, {
      mediaId,
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

    const result = await whatsapp.sendTemplateMessage(
      app.log,
      conversation.contact.waId,
      body.templateName,
      body.languageCode,
      body.components,
    )

    const [message] = await db
      .insert(messages)
      .values({
        conversationId: id,
        waMessageId: result.message_id,
        sentBy: request.agent.id,
        direction: 'outbound',
        type: 'text',
        body: `[template: ${body.templateName}]`,
        status: 'sent',
      })
      .returning()

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: `[template] ${body.templateName}` })
      .where(eq(conversations.id, id))

    await tryActivateCtwaFep(id)
    const messaging = await loadMessagingPayload(id)
    emitNewMessage(app.io, id, message, messaging)
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
    unreadCount: c.unreadCount,
    aiHandled: c.aiHandled,
    ...shapeMessagingFields(c),
  }
}
