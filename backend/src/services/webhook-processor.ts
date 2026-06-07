import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import {
  contacts,
  conversations,
  messages,
  conversationEvents,
  teamMembers,
  type Contact,
  type Conversation,
} from '../db/schema.js'
import { config } from '../config.js'
import { enqueueJob } from './jobs.js'
import { routeConversation } from './router.js'
import {
  normalizeStatusForMessageType,
  normalizeWaMessageStatus,
  shouldUpgradeStatus,
} from '../utils/message-status.js'
import { customerServiceWindowExpiresAt } from '../utils/messaging-windows.js'
import { conversationPreviewFromMessage } from '../utils/conversation-preview.js'
import { loadMessagingPayload } from './ctwa-fep.js'
import { emitMessageStatus, emitNewMessage } from './socket-events.js'

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker'])
const isMediaType = (t: string) => MEDIA_TYPES.has(t)

interface WaMedia {
  id: string
  mime_type?: string
  filename?: string
  caption?: string
}

interface WaMessage {
  from: string
  to?: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  context?: { id?: string; from?: string }
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
  // Collect per-change failures and re-throw at the end so the caller leaves the
  // webhook_events row unprocessed (replayable). Was: errors were swallowed here,
  // so a failed handler still marked the event processed -> silent data loss.
  const errors: unknown[] = []
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
        app.log.error({ err, field: change.field }, 'webhook change handling failed')
        errors.push(err)
      }
    }
  }

  if (errors.length > 0) {
    const summary = errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .join('; ')
    throw new Error(`webhook processing failed for ${errors.length} change(s): ${summary}`)
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
      columns: {
        id: true,
        conversationId: true,
        status: true,
        direction: true,
        type: true,
      },
    })
    if (!existing || existing.direction !== 'outbound') continue

    const statusToStore = normalizeStatusForMessageType(existing.type, normalized)
    if (!shouldUpgradeStatus(existing.status, statusToStore)) continue

    if (statusToStore === 'failed') {
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
      statusToStore === 'failed' && status.errors?.length
        ? status.errors
            .map((e) => e.error_data?.details ?? e.message ?? e.title)
            .filter(Boolean)
            .join(' ')
        : null

    const [row] = await db
      .update(messages)
      .set({
        status: statusToStore,
        ...(errorMessage ? { errorMessage } : {}),
      })
      .where(eq(messages.id, existing.id))
      .returning({ conversationId: messages.conversationId, id: messages.id })

    if (row) {
      await db
        .update(conversations)
        .set({ lastMessageStatus: statusToStore })
        .where(
          and(
            eq(conversations.id, row.conversationId),
            eq(conversations.lastMessageId, existing.id),
          ),
        )

      emitMessageStatus(app.io, {
        conversationId: row.conversationId,
        messageId: row.id,
        waMessageId: status.id,
        status: statusToStore,
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

    const echoMedia = inboundMediaMeta(msg)

    const inserted = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        waMessageId: msg.id,
        direction: 'outbound',
        type: msg.type,
        body: inboundBody(msg),
        mediaStatus: isMediaType(msg.type) ? 'pending' : null,
        mediaMimeType: echoMedia.mediaMimeType,
        mediaFilename: echoMedia.mediaFilename,
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
        ...conversationPreviewFromMessage(message),
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

    // Resolve a reply-to (WhatsApp `context.id`) to a local message so the quote
    // block renders for customer replies, not just our own outbound replies.
    let replyToMessageId: string | null = null
    if (msg.context?.id) {
      const referenced = await db.query.messages.findFirst({
        where: and(
          eq(messages.conversationId, conversation.id),
          eq(messages.waMessageId, msg.context.id),
        ),
        columns: { id: true },
      })
      replyToMessageId = referenced?.id ?? null
    }

    const mediaMeta = inboundMediaMeta(msg)

    // Idempotent insert: duplicate webhook deliveries hit the unique wa_message_id.
    const inserted = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        waMessageId: msg.id,
        direction: 'inbound',
        type: msg.type,
        body: inboundBody(msg),
        mediaStatus: isMediaType(msg.type) ? 'pending' : null,
        mediaMimeType: mediaMeta.mediaMimeType,
        mediaFilename: mediaMeta.mediaFilename,
        replyToMessageId,
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
          // Use the message timestamp — Meta retries must not bump the chat with wall-clock now().
          lastMessageAt: inboundAt,
          ...(isCtwaInbound && !conversation.ctwaStartedAt
            ? { ctwaStartedAt: inboundAt }
            : {}),
        })
        .where(eq(conversations.id, conversation.id))

      // Recover side effects that a crashed earlier attempt may have skipped after
      // the row was already inserted: re-enqueue a stuck media download so the
      // attachment isn't pending forever (otherwise nothing self-heals it).
      if (isMediaType(msg.type)) {
        const existing = await db.query.messages.findFirst({
          where: eq(messages.waMessageId, msg.id),
          columns: { id: true, mediaStatus: true, mediaUrl: true },
        })
        const media = msg[msg.type] as WaMedia | undefined
        if (existing && existing.mediaStatus === 'pending' && !existing.mediaUrl && media?.id) {
          await enqueueJob('download_media', {
            messageId: existing.id,
            conversationId: conversation.id,
            waMediaId: media.id,
            mimeType: media.mime_type ?? mimeForMediaType(msg.type, media.mime_type),
            filename: media.filename ?? defaultFilename(msg.type),
          })
        }
      }
      continue
    }
    const message = inserted[0]

    const wasResolved = conversation.status === 'resolved'

    await db
      .update(conversations)
      .set({
        windowExpiresAt,
        status: wasResolved ? 'open' : conversation.status,
        lastMessageAt: inboundAt,
        lastMessagePreview: getPreview(msg),
        ...conversationPreviewFromMessage(message),
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

    // Route when unassigned; otherwise, if an AI agent owns the thread, enqueue a
    // reply for this inbound. Was: AI only replied on first assignment, so every
    // follow-up customer message went unanswered.
    const current = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversation.id),
      with: { contact: true },
    })
    if (current && !current.assignedTo) {
      await routeConversation(current, app.io, app.log)
    } else if (current?.assignedTo) {
      const assignee = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.id, current.assignedTo),
        columns: { role: true },
      })
      if (
        config.AI_AGENT_ENABLED &&
        assignee?.role === 'ai_agent' &&
        current.routingLock !== 'human_only'
      ) {
        await enqueueJob('ai_agent_reply', {
          conversationId: current.id,
          agentId: current.assignedTo,
        })
      } else if (assignee && assignee.role !== 'ai_agent') {
        const contactName =
          current.contact?.name ?? waContact?.profile?.name ?? 'Customer'
        await enqueueJob('send_push_notification', {
          agentId: current.assignedTo,
          title: contactName,
          body: getPreview(msg),
          data: { conversationId: current.id },
        })
      }
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
  if (msg.type === 'location') return '📍 Location'
  if (msg.type === 'contacts') return '👤 Contact'
  if (msg.type === 'interactive') {
    const interactive = msg.interactive as
      | { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string } }
      | undefined
    const title = interactive?.button_reply?.title ?? interactive?.list_reply?.title
    if (title) return title.slice(0, 120)
    return 'Interactive message'
  }
  if (msg.type === 'button') {
    const button = msg.button as { text?: string } | undefined
    return (button?.text ?? 'Button reply').slice(0, 120)
  }
  if (msg.type === 'image') return labelWithCaption('📷 Photo', msg.image?.caption)
  if (msg.type === 'video') return labelWithCaption('🎥 Video', msg.video?.caption)
  if (msg.type === 'audio') return '🎤 Audio'
  if (msg.type === 'sticker') return 'Sticker'
  if (msg.type === 'document') {
    return labelWithCaption(`📄 ${msg.document?.filename ?? 'Document'}`, msg.document?.caption)
  }
  return `[${msg.type}]`
}

function labelWithCaption(label: string, caption?: string): string {
  const trimmed = caption?.trim()
  return (trimmed ? trimmed : label).slice(0, 120)
}

function inboundBody(msg: WaMessage): string | null {
  if (msg.type === 'text') return msg.text?.body ?? null
  if (msg.type === 'button') {
    const button = msg.button as { text?: string } | undefined
    return button?.text ?? null
  }
  if (msg.type === 'interactive') {
    const interactive = msg.interactive as
      | { button_reply?: { title?: string }; list_reply?: { title?: string } }
      | undefined
    return interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? null
  }
  // Media captions live on the type-specific block; persist them so they render
  // under the media bubble and are reachable by message search.
  if (msg.type === 'image') return msg.image?.caption ?? null
  if (msg.type === 'video') return msg.video?.caption ?? null
  if (msg.type === 'document') return msg.document?.caption ?? null
  return null
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

function inboundMediaMeta(msg: WaMessage): {
  mediaMimeType: string | null
  mediaFilename: string | null
} {
  if (!isMediaType(msg.type)) {
    return { mediaMimeType: null, mediaFilename: null }
  }
  const media = msg[msg.type] as WaMedia | undefined
  if (!media) {
    return { mediaMimeType: null, mediaFilename: null }
  }
  return {
    mediaMimeType: media.mime_type ?? mimeForMediaType(msg.type, media.mime_type),
    mediaFilename: media.filename ?? defaultFilename(msg.type),
  }
}
