import type { Message, MessageDirection, MessageStatus, MessageType, MediaStatus } from '@/types'

/** Normalize API/socket payloads (handles accidental snake_case). */
export function normalizeMessage(raw: Message & Record<string, unknown>): Message {
  const mediaUrl = (raw.mediaUrl ?? raw.media_url ?? null) as string | null
  const mediaMimeType = (raw.mediaMimeType ?? raw.media_mime_type ?? null) as string | null
  const mediaFilename = (raw.mediaFilename ?? raw.media_filename ?? null) as string | null
  const mediaStatus = (raw.mediaStatus ?? raw.media_status ?? null) as MediaStatus
  const sentAt = String(raw.sentAt ?? raw.sent_at ?? new Date().toISOString())
  const createdAt = String(raw.createdAt ?? raw.created_at ?? sentAt)

  return {
    id: String(raw.id),
    conversationId: String(raw.conversationId ?? raw.conversation_id),
    waMessageId: (raw.waMessageId ?? raw.wa_message_id ?? null) as string | null,
    sentBy: (raw.sentBy ?? raw.sent_by ?? null) as string | null,
    direction: (raw.direction ?? 'outbound') as MessageDirection,
    type: (raw.type ?? 'text') as MessageType,
    body: (raw.body ?? null) as string | null,
    mediaUrl,
    mediaMimeType,
    mediaFilename,
    mediaStatus,
    status: (raw.status ?? 'sent') as MessageStatus,
    errorMessage: (raw.errorMessage ?? raw.error_message ?? null) as string | null,
    replyToMessageId: (raw.replyToMessageId ?? raw.reply_to_message_id ?? null) as
      | string
      | null,
    deletedAt: (raw.deletedAt ?? raw.deleted_at ?? null) as string | null,
    editedAt: (raw.editedAt ?? raw.edited_at ?? null) as string | null,
    replyTo: raw.replyTo ?? null,
    sentAt,
    createdAt,
    localPreviewUri: raw.localPreviewUri,
  }
}

export function normalizeMessagesResponse(data: {
  messages: (Message & Record<string, unknown>)[]
  nextCursor: string | null
}) {
  return {
    nextCursor: data.nextCursor,
    messages: data.messages.map((m) => normalizeMessage(m)),
  }
}
