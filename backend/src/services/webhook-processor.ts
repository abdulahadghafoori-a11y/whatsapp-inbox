import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import {
  contacts,
  conversations,
  messages,
  conversationEvents,
  type Contact,
  type Conversation,
} from '../db/schema.js'
import { enqueueJob } from './jobs.js'
import { routeConversation } from './router.js'
import {
  normalizeWaMessageStatus,
  shouldUpgradeStatus,
} from '../utils/message-status.js'
import { customerServiceWindowExpiresAt } from '../utils/messaging-windows.js'
import { loadMessagingPayload } from './ctwa-fep.js'
import { emitNewMessage } from './socket-events.js'

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker'])
const isMediaType = (t: string) => MEDIA_TYPES.has(t)

interface WaMedia {
  id: string
  mime_type?: string
  filename?: string
}

interface WaMessage {
  from: string
  to?: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  referral?: {
    source_url?: string
    source_id?: string
    source_type?: string
    headline?: string
    body?: string
    media_type?: string
    image_url?: string
    ctwa_clid?: string
    welcome_message?: { text: string }
  }
  image?: WaMedia
  video?: WaMedia
  audio?: WaMedia
  document?: WaMedia
  sticker?: WaMedia
  [key: string]: unknown
}

interface WaStatus {
  id: string
  status: string
  errors?: Array<{
    code?: number
    title?: string
    message?: string
    error_data?: { details?: string }
  }>
}

interface WaContact {
  wa_id: string
  profile?: { name?: string }
}

interface WaChangeValue {
  messages?: WaMessage[]
  /** Outbound copies when the business sends from WhatsApp app (field: smb_message_echoes). */
  message_echoes?: WaMessage[]
  statuses?: WaStatus[]
  contacts?: WaContact[]
}

interface WaPayload {
  entry?: Array<{
    changes?: Array<{ field?: string; value?: WaChangeValue }>
  }>
}

export async function processWebhookPayload(
  app: FastifyInstance,
  payload: unknown,
): Promise<void> {
  const data = payload as WaPayload
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      try {
        await handleStatuses(app, value)
        await handleMessages(app, value)
        await handleMessageEchoes(app, value)
        const handled =
          (value.messages?.length ?? 0) +
          (value.message_echoes?.length ?? 0) +
          (value.statuses?.length ?? 0)
        if (handled === 0) {
          app.log.info(
            { field: change.field, keys: Object.keys(value) },
            'webhook change ignored (no messages, message_echoes, or statuses)',
          )
        }
      } catch (err) {
        app.log.error({ err }, 'webhook change handling failed')
      }
    }
  }
}

async function handleStatuses(app: FastifyInstance, value: WaChangeValue): Promise<void> {
  for (const status of value.statuses ?? []) {
    const normalized = normalizeWaMessageStatus(status.status)
    if (!normalized) {
      app.log.debug({ status: status.status, waMessageId: status.id }, 'ignored webhook status')
      continue
    }

    const existing = await db.query.messages.findFirst({
      where: eq(messages.waMessageId, status.id),
      columns: { id: true, conversationId: true, status: true, direction: true },
    })
    if (!existing || existing.direction !== 'outbound') continue
    if (!shouldUpgradeStatus(existing.status, normalized)) continue

    if (normalized === 'failed') {
      app.log.warn(
        {
          waMessageId: status.id,
          messageId: existing.id,
          errors: status.errors,
        },
        'whatsapp_message_delivery_failed',
      )
    }

    const errorMessage =
      normalized === 'failed' && status.errors?.length
        ? status.errors
            .map((e) => e.error_data?.details ?? e.message ?? e.title)
            .filter(Boolean)
            .join(' ')
        : null

    const [row] = await db
      .update(messages)
      .set({
        status: normalized,
        ...(errorMessage ? { errorMessage } : {}),
      })
      .where(eq(messages.id, existing.id))
      .returning({ conversationId: messages.conversationId, id: messages.id })

    if (row) {
      app.io
        .to(`conversation:${row.conversationId}`)
        .emit('message_status', {
          conversationId: row.conversationId,
          messageId: row.id,
          waMessageId: status.id,
          status: normalized,
        })
    }
  }
}

/**
 * SMB / coexistence echoes: messages sent by the business (WhatsApp app or API).
 * Thread by the customer number in `to` (recipient).
 */
async function handleMessageEchoes(
  app: FastifyInstance,
  value: WaChangeValue,
): Promise<void> {
  for (const msg of value.message_echoes ?? []) {
    const customerWaId = msg.to ?? msg.from
    const waContact = value.contacts?.find((c) => c.wa_id === customerWaId)
    const contact = await upsertContact(customerWaId, waContact?.profile?.name)
    const conversation = await upsertConversation(contact.id)

    const inserted = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        waMessageId: msg.id,
        direction: 'outbound',
        type: msg.type,
        body: msg.type === 'text' ? msg.text?.body ?? null : null,
        mediaStatus: isMediaType(msg.type) ? 'pending' : null,
        metadata: { ...msg, source: 'message_echo' } as Record<string, unknown>,
        status: 'sent',
        sentAt: new Date(Number(msg.timestamp) * 1000),
      })
      .onConflictDoNothing({ target: messages.waMessageId })
      .returning()

    if (inserted.length === 0) {
      app.log.debug({ waMessageId: msg.id }, 'duplicate message echo ignored')
      continue
    }
    const message = inserted[0]

    app.log.info(
      { conversationId: conversation.id, waMessageId: msg.id, to: customerWaId },
      'message_echo stored (sent outside inbox app)',
    )

    await db
      .update(conversations)
      .set({
        lastMessageAt: message.sentAt,
        lastMessagePreview: getPreview(msg),
      })
      .where(eq(conversations.id, conversation.id))

    const messaging = await loadMessagingPayload(conversation.id)
    emitNewMessage(app.io, conversation.id, message, messaging)

    if (isMediaType(msg.type)) {
      const media = msg[msg.type] as WaMedia | undefined
      if (media?.id) {
        await enqueueJob('download_media', {
          messageId: message.id,
          conversationId: conversation.id,
          waMediaId: media.id,
          mimeType: media.mime_type ?? mimeForMediaType(msg.type, media.mime_type),
          filename: media.filename ?? defaultFilename(msg.type),
        })
      }
    }
  }
}

async function handleMessages(app: FastifyInstance, value: WaChangeValue): Promise<void> {
  for (const msg of value.messages ?? []) {
    const waContact = value.contacts?.find((c) => c.wa_id === msg.from)
    const contact = await upsertContact(msg.from, waContact?.profile?.name)
    const conversation = await upsertConversation(contact.id)

    // Idempotent insert: duplicate webhook deliveries hit the unique wa_message_id.
    const inserted = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        waMessageId: msg.id,
        direction: 'inbound',
        type: msg.type,
        body: msg.type === 'text' ? msg.text?.body ?? null : null,
        mediaStatus: isMediaType(msg.type) ? 'pending' : null,
        metadata: msg as unknown as Record<string, unknown>,
        sentAt: new Date(Number(msg.timestamp) * 1000),
      })
      .onConflictDoNothing({ target: messages.waMessageId })
      .returning()

    const windowExpiresAt = customerServiceWindowExpiresAt(Number(msg.timestamp))
    const inboundAt = new Date(Number(msg.timestamp) * 1000)
    const isCtwaInbound = !!msg.referral

    if (inserted.length === 0) {
      app.log.debug({ waMessageId: msg.id }, 'duplicate webhook message ignored')
      await db
        .update(conversations)
        .set({
          windowExpiresAt,
          lastMessageAt: new Date(),
          ...(isCtwaInbound && !conversation.ctwaStartedAt
            ? { ctwaStartedAt: inboundAt }
            : {}),
        })
        .where(eq(conversations.id, conversation.id))
      continue
    }
    const message = inserted[0]

    const wasResolved = conversation.status === 'resolved'

    await db
      .update(conversations)
      .set({
        windowExpiresAt,
        status: wasResolved ? 'open' : conversation.status,
        lastMessageAt: new Date(),
        lastMessagePreview: getPreview(msg),
        unreadCount: sql`${conversations.unreadCount} + 1`,
        ...(isCtwaInbound
          ? {
              ctwaClid: msg.referral!.ctwa_clid ?? conversation.ctwaClid,
              referralSourceUrl: msg.referral!.source_url ?? conversation.referralSourceUrl,
              referralSourceType: msg.referral!.source_type ?? conversation.referralSourceType,
              adId: msg.referral!.source_id ?? conversation.adId,
              adTitle: msg.referral!.headline ?? conversation.adTitle,
              adBody: msg.referral!.body ?? conversation.adBody,
              referralMetadata: {
                image_url: msg.referral!.image_url,
                media_type: msg.referral!.media_type,
                welcome_message: msg.referral!.welcome_message,
              },
              ctwaStartedAt: conversation.ctwaStartedAt ?? inboundAt,
            }
          : {}),
      })
      .where(eq(conversations.id, conversation.id))

    if (wasResolved) {
      await db.insert(conversationEvents).values({
        conversationId: conversation.id,
        type: 'reopened',
        payload: { trigger: 'inbound_message' },
      })
    }

    const messaging = await loadMessagingPayload(conversation.id)
    emitNewMessage(app.io, conversation.id, message, messaging)

    if (isMediaType(msg.type)) {
      const media = msg[msg.type] as WaMedia | undefined
      if (media?.id) {
        await enqueueJob('download_media', {
          messageId: message.id,
          conversationId: conversation.id,
          waMediaId: media.id,
          mimeType: media.mime_type ?? mimeForMediaType(msg.type, media.mime_type),
          filename: media.filename ?? defaultFilename(msg.type),
        })
      }
    }

    // Route only when reopened or freshly created and currently unassigned.
    const current = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversation.id),
    })
    if (current && !current.assignedTo) {
      await routeConversation(current, app.io, app.log)
    }
  }
}

async function upsertContact(waId: string, name?: string): Promise<Contact> {
  const [row] = await db
    .insert(contacts)
    .values({ waId, name: name ?? null })
    .onConflictDoUpdate({
      target: contacts.waId,
      // Only refresh the name when WhatsApp provides one.
      set: name ? { name } : { waId },
    })
    .returning()
  return row
}

async function upsertConversation(contactId: string): Promise<Conversation> {
  const inserted = await db
    .insert(conversations)
    .values({ contactId, status: 'open' })
    .onConflictDoNothing({ target: conversations.contactId })
    .returning()

  if (inserted.length > 0) return inserted[0]

  const existing = await db.query.conversations.findFirst({
    where: eq(conversations.contactId, contactId),
  })
  return existing as Conversation
}

function getPreview(msg: WaMessage): string {
  if (msg.type === 'text') return (msg.text?.body ?? '').slice(0, 120)
  return `[${msg.type}]`
}

function mimeForMediaType(type: string, fromPayload?: string): string {
  if (fromPayload) return fromPayload
  switch (type) {
    case 'image':
    case 'sticker':
      return 'image/webp'
    case 'video':
      return 'video/mp4'
    case 'audio':
      return 'audio/ogg'
    case 'document':
      return 'application/octet-stream'
    default:
      return 'application/octet-stream'
  }
}

function defaultFilename(type: string): string {
  switch (type) {
    case 'sticker':
      return 'sticker.webp'
    case 'image':
      return 'image.jpg'
    case 'video':
      return 'video.mp4'
    case 'audio':
      return 'audio.ogg'
    case 'document':
      return 'document'
    default:
      return 'upload'
  }
}
