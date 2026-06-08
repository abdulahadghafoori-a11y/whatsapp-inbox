import { eq, sql } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import { db } from '../db/index.js'
import { conversations, messages, type Message } from '../db/schema.js'
import { enqueueJob, type JobPayloads } from './jobs.js'
import { tryActivateCtwaFep, loadMessagingPayload } from './ctwa-fep.js'
import { conversationPreviewFromMessage } from '../utils/conversation-preview.js'
import { emitMessageStatus, emitNewMessage } from './socket-events.js'

interface OutboundTextArgs {
  conversationId: string
  to: string
  body: string
  sentBy: string | null
  replyToMessageId?: string
  replyToWaMessageId?: string
}

interface OutboundMediaArgs {
  conversationId: string
  to: string
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  /** Omitted when WhatsApp upload is deferred to the send job (large client uploads). */
  mediaId?: string
  s3Key: string
  mimeType: string
  filename: string
  caption?: string
  sentBy: string | null
  voiceNote?: boolean
  replyToMessageId?: string
  replyToWaMessageId?: string
  mediaThumbUrl?: string | null
  mediaFileSize?: number | null
}

function preview(type: string, body?: string | null): string {
  if (type === 'text') return (body ?? '').slice(0, 120)
  if (type === 'location') return '📍 Location'
  return `[${type}]`
}

interface OutboundLocationArgs {
  conversationId: string
  to: string
  latitude: number
  longitude: number
  name?: string
  address?: string
  sentBy: string | null
  replyToMessageId?: string
  replyToWaMessageId?: string
}

async function finalize(io: SocketIOServer, conversationId: string, message: Message) {
  await tryActivateCtwaFep(conversationId)

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: preview(message.type, message.body),
      // Record the first business reply once (SLA first-response metric).
      firstResponseAt: sql`COALESCE(${conversations.firstResponseAt}, NOW())`,
      ...conversationPreviewFromMessage(message),
    })
    .where(eq(conversations.id, conversationId))

  const messaging = await loadMessagingPayload(conversationId)
  emitNewMessage(io, conversationId, message, messaging)
}

/** Persist an outbound text message and queue delivery via the job processor. */
export async function createOutboundText(
  io: SocketIOServer,
  args: OutboundTextArgs,
): Promise<Message> {
  // Atomic: a message must never exist without its delivery job (and vice versa),
  // otherwise it gets stuck 'pending' forever with no worker to pick it up.
  const message = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({
        conversationId: args.conversationId,
        sentBy: args.sentBy,
        direction: 'outbound',
        type: 'text',
        body: args.body,
        status: 'pending',
        replyToMessageId: args.replyToMessageId ?? null,
      })
      .returning()

    await enqueueJob(
      'send_whatsapp_message',
      {
        to: args.to,
        type: 'text',
        conversationId: args.conversationId,
        messageId: m.id,
        body: args.body,
        replyToWaMessageId: args.replyToWaMessageId,
      },
      { executor: tx },
    )
    return m
  })

  await finalize(io, args.conversationId, message)
  return message
}

export async function createOutboundLocation(
  io: SocketIOServer,
  args: OutboundLocationArgs,
): Promise<Message> {
  const metadata = {
    latitude: args.latitude,
    longitude: args.longitude,
    ...(args.name ? { name: args.name } : {}),
    ...(args.address ? { address: args.address } : {}),
  }
  const message = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({
        conversationId: args.conversationId,
        sentBy: args.sentBy,
        direction: 'outbound',
        type: 'location',
        body: null,
        status: 'pending',
        metadata,
        replyToMessageId: args.replyToMessageId ?? null,
      })
      .returning()

    await enqueueJob(
      'send_whatsapp_message',
      {
        to: args.to,
        type: 'location',
        conversationId: args.conversationId,
        messageId: m.id,
        location: metadata,
        replyToWaMessageId: args.replyToWaMessageId,
      },
      { executor: tx },
    )
    return m
  })

  await finalize(io, args.conversationId, message)
  return message
}

/** Persist an outbound media message (already uploaded to WA + S3) and queue delivery. */
export async function createOutboundMedia(
  io: SocketIOServer,
  args: OutboundMediaArgs,
): Promise<Message> {
  const message = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({
        conversationId: args.conversationId,
        sentBy: args.sentBy,
        direction: 'outbound',
        type: args.type,
        body: args.caption ?? null,
        mediaUrl: args.s3Key,
        mediaThumbUrl: args.mediaThumbUrl ?? null,
        mediaFileSize: args.mediaFileSize ?? null,
        mediaMimeType: args.mimeType,
        mediaFilename: args.filename,
        mediaStatus: 'uploaded',
        status: 'pending',
        replyToMessageId: args.replyToMessageId ?? null,
      })
      .returning()

    await enqueueJob(
      'send_whatsapp_message',
      {
        to: args.to,
        type: args.type,
        conversationId: args.conversationId,
        messageId: m.id,
        ...(args.mediaId ? { mediaId: args.mediaId } : { s3Key: args.s3Key }),
        caption: args.caption,
        voiceNote: args.voiceNote,
        replyToWaMessageId: args.replyToWaMessageId,
      },
      { executor: tx },
    )
    return m
  })

  await finalize(io, args.conversationId, message)
  return message
}

interface OutboundTemplateArgs {
  conversationId: string
  to: string
  templateName: string
  languageCode: string
  components?: unknown[]
  sentBy: string | null
}

/** Was: template sent synchronously in route — now job-backed like other outbound messages. */
export async function createOutboundTemplate(
  io: SocketIOServer,
  args: OutboundTemplateArgs,
): Promise<Message> {
  const message = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({
        conversationId: args.conversationId,
        sentBy: args.sentBy,
        direction: 'outbound',
        type: 'text',
        body: `[template: ${args.templateName}]`,
        status: 'pending',
        metadata: {
          templateName: args.templateName,
          languageCode: args.languageCode,
          ...(args.components ? { components: args.components } : {}),
        },
      })
      .returning()

    await enqueueJob(
      'send_whatsapp_message',
      {
        to: args.to,
        type: 'template',
        conversationId: args.conversationId,
        messageId: m.id,
        templateName: args.templateName,
        languageCode: args.languageCode,
        components: args.components,
      },
      { executor: tx },
    )
    return m
  })

  await finalize(io, args.conversationId, message)
  return message
}

/** Strip the send-job in-flight marker so a failed message can be retried. */
export function metadataWithoutSendInFlight(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') return null
  const { sendInFlightAt: _ignored, ...rest } = metadata as Record<string, unknown>
  return Object.keys(rest).length > 0 ? rest : null
}

async function replyWaIdForMessage(message: Message): Promise<string | undefined> {
  if (!message.replyToMessageId) return undefined
  const parent = await db.query.messages.findFirst({
    where: eq(messages.id, message.replyToMessageId),
    columns: { waMessageId: true, conversationId: true },
  })
  if (!parent || parent.conversationId !== message.conversationId) return undefined
  return parent.waMessageId ?? undefined
}

/** Re-queue a failed outbound message for WhatsApp delivery. */
export async function resendOutboundMessage(
  io: SocketIOServer,
  message: Message,
  to: string,
  opts: { mediaId?: string; s3Key?: string; voiceNote?: boolean },
): Promise<Message> {
  const cleanedMetadata = metadataWithoutSendInFlight(message.metadata)
  const replyToWaMessageId = await replyWaIdForMessage(message)

  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(messages)
      .set({
        status: 'pending',
        errorMessage: null,
        metadata: cleanedMetadata,
      })
      .where(eq(messages.id, message.id))
      .returning()

    if (message.type === 'text') {
      const templateMeta = cleanedMetadata as {
        templateName?: string
        languageCode?: string
        components?: unknown[]
      } | null
      if (templateMeta?.templateName && templateMeta?.languageCode) {
        await enqueueJob(
          'send_whatsapp_message',
          {
            to,
            type: 'template',
            conversationId: message.conversationId,
            messageId: message.id,
            templateName: templateMeta.templateName,
            languageCode: templateMeta.languageCode,
            components: templateMeta.components,
          },
          { executor: tx },
        )
      } else {
        await enqueueJob(
          'send_whatsapp_message',
          {
            to,
            type: 'text',
            conversationId: message.conversationId,
            messageId: message.id,
            body: message.body ?? '',
            replyToWaMessageId,
          },
          { executor: tx },
        )
      }
    } else if (message.type === 'location') {
      const loc = cleanedMetadata as {
        latitude?: number
        longitude?: number
        name?: string
        address?: string
      } | null
      if (typeof loc?.latitude !== 'number' || typeof loc?.longitude !== 'number') {
        throw new Error('Location metadata missing for resend')
      }
      await enqueueJob(
        'send_whatsapp_message',
        {
          to,
          type: 'location',
          conversationId: message.conversationId,
          messageId: message.id,
          location: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            name: loc.name,
            address: loc.address,
          },
          replyToWaMessageId,
        },
        { executor: tx },
      )
    } else {
      if (!opts.mediaId && !opts.s3Key) throw new Error('mediaId or s3Key required to resend')
      const mediaType = message.type as JobPayloads['send_whatsapp_message']['type']
      await enqueueJob(
        'send_whatsapp_message',
        {
          to,
          type: mediaType,
          conversationId: message.conversationId,
          messageId: message.id,
          ...(opts.mediaId ? { mediaId: opts.mediaId } : { s3Key: opts.s3Key! }),
          caption: message.body ?? undefined,
          voiceNote: opts.voiceNote,
          replyToWaMessageId,
        },
        { executor: tx },
      )
    }
    return u
  })

  emitMessageStatus(io, {
    conversationId: message.conversationId,
    messageId: message.id,
    status: 'pending',
  })

  return updated
}
