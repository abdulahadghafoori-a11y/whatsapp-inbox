import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, messages } from '../db/schema.js'
import { errors } from '../utils/errors.js'
import { resolveMessagingState } from '../utils/messaging-windows.js'
import { attachReplyPreviews } from '../utils/message-shape.js'
import { createOutboundLocation, createOutboundText } from './outbound.js'
import { sendOutboundMediaFromS3Key } from './outbound-media-buffer.js'

/** Re-send an existing message into another conversation (forward). */
export async function forwardMessageToConversation(
  app: FastifyInstance,
  opts: {
    sourceMessageId: string
    targetConversationId: string
    sentBy: string
  },
) {
  const source = await db.query.messages.findFirst({
    where: eq(messages.id, opts.sourceMessageId),
  })
  if (!source || source.deletedAt) {
    throw errors.notFound('Message not found')
  }

  const target = await db.query.conversations.findFirst({
    where: eq(conversations.id, opts.targetConversationId),
    with: { contact: true },
  })
  if (!target?.contact) throw errors.conversationNotFound()

  if (!resolveMessagingState(target).canSendSession) {
    throw errors.windowExpired()
  }

  if (source.type === 'location' && source.metadata && typeof source.metadata === 'object') {
    const meta = source.metadata as Record<string, unknown>
    const latitude = Number(meta.latitude)
    const longitude = Number(meta.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw errors.validation('Location data is missing for this message.')
    }
    const raw = await createOutboundLocation(app.io, {
      conversationId: target.id,
      to: target.contact.waId,
      latitude,
      longitude,
      name: typeof meta.name === 'string' ? meta.name : undefined,
      address: typeof meta.address === 'string' ? meta.address : undefined,
      sentBy: opts.sentBy,
    })
    return (await attachReplyPreviews([raw]))[0]
  }

  if (source.type === 'text' && source.body) {
    const raw = await createOutboundText(app.io, {
      conversationId: target.id,
      to: target.contact.waId,
      body: source.body,
      sentBy: opts.sentBy,
    })
    return (await attachReplyPreviews([raw]))[0]
  }

  if (source.type !== 'text' && source.mediaUrl) {
    // Stored media was client-prepared on first send — re-upload bytes as-is.
    const raw = await sendOutboundMediaFromS3Key(app, {
      conversationId: target.id,
      contactWaId: target.contact.waId,
      s3Key: source.mediaUrl,
      filename: source.mediaFilename ?? 'forward',
      mimeType: source.mediaMimeType ?? 'application/octet-stream',
      caption: source.body ?? undefined,
      sentBy: opts.sentBy,
      passthrough: true,
    })
    return (await attachReplyPreviews([raw]))[0]
  }

  throw errors.validation('This message cannot be forwarded.')
}
