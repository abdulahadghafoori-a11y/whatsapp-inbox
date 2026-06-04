import { eq } from 'drizzle-orm'
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
  mediaId: string
  s3Key: string
  mimeType: string
  filename: string
  caption?: string
  sentBy: string | null
  voiceNote?: boolean
  replyToMessageId?: string
  replyToWaMessageId?: string
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
  const [message] = await db
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

  await enqueueJob('send_whatsapp_message', {
    to: args.to,
    type: 'text',
    conversationId: args.conversationId,
    messageId: message.id,
    body: args.body,
    replyToWaMessageId: args.replyToWaMessageId,
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
  const [message] = await db
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

  await enqueueJob('send_whatsapp_message', {
    to: args.to,
    type: 'location',
    conversationId: args.conversationId,
    messageId: message.id,
    location: metadata,
    replyToWaMessageId: args.replyToWaMessageId,
  })

  await finalize(io, args.conversationId, message)
  return message
}

/** Persist an outbound media message (already uploaded to WA + S3) and queue delivery. */
export async function createOutboundMedia(
  io: SocketIOServer,
  args: OutboundMediaArgs,
): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: args.conversationId,
      sentBy: args.sentBy,
      direction: 'outbound',
      type: args.type,
      body: args.caption ?? null,
      mediaUrl: args.s3Key,
      mediaMimeType: args.mimeType,
      mediaFilename: args.filename,
      mediaStatus: 'uploaded',
      status: 'pending',
      replyToMessageId: args.replyToMessageId ?? null,
    })
    .returning()

  await enqueueJob('send_whatsapp_message', {
    to: args.to,
    type: args.type,
    conversationId: args.conversationId,
    messageId: message.id,
    mediaId: args.mediaId,
    caption: args.caption,
    voiceNote: args.voiceNote,
    replyToWaMessageId: args.replyToWaMessageId,
  })

  await finalize(io, args.conversationId, message)
  return message
}

/** Re-queue a failed outbound message for WhatsApp delivery. */
export async function resendOutboundMessage(
  io: SocketIOServer,
  message: Message,
  to: string,
  opts: { mediaId?: string; voiceNote?: boolean },
): Promise<Message> {
  const [updated] = await db
    .update(messages)
    .set({ status: 'pending', errorMessage: null })
    .where(eq(messages.id, message.id))
    .returning()

  if (message.type === 'text') {
    await enqueueJob('send_whatsapp_message', {
      to,
      type: 'text',
      conversationId: message.conversationId,
      messageId: message.id,
      body: message.body ?? '',
    })
  } else {
    if (!opts.mediaId) throw new Error('Media id required to resend')
    const mediaType = message.type as JobPayloads['send_whatsapp_message']['type']
    await enqueueJob('send_whatsapp_message', {
      to,
      type: mediaType,
      conversationId: message.conversationId,
      messageId: message.id,
      mediaId: opts.mediaId,
      caption: message.body ?? undefined,
      voiceNote: opts.voiceNote,
    })
  }

  emitMessageStatus(io, {
    conversationId: message.conversationId,
    messageId: message.id,
    status: 'pending',
  })

  return updated
}
