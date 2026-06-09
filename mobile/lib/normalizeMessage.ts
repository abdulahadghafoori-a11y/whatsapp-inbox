import type {
  Message,
  MessageDirection,
  MessageReplyPreview,
  MessageStatus,
  MessageType,
  MediaStatus,
} from '@/types'

function normalizeReplyPreview(raw: unknown): MessageReplyPreview | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    id: String(r.id),
    direction: (r.direction ?? 'outbound') as MessageDirection,
    type: (r.type ?? 'text') as MessageType,
    body: (r.body ?? null) as string | null,
    deletedAt: (r.deletedAt ?? r.deleted_at ?? null) as string | null,
    mediaUrl: (r.mediaUrl ?? r.media_url ?? null) as string | null,
    mediaMimeType: (r.mediaMimeType ?? r.media_mime_type ?? null) as string | null,
    mediaFilename: (r.mediaFilename ?? r.media_filename ?? null) as string | null,
  }
}

/** Normalize API/socket payloads (handles accidental snake_case). */
export function normalizeMessage(raw: Message & Record<string, unknown>): Message {
  const mediaUrl = (raw.mediaUrl ?? raw.media_url ?? null) as string | null
  const mediaThumbUrl = (raw.mediaThumbUrl ?? raw.media_thumb_url ?? null) as string | null
  const mediaFileSizeRaw = raw.mediaFileSize ?? raw.media_file_size
  const mediaFileSize =
    typeof mediaFileSizeRaw === 'number' && mediaFileSizeRaw > 0 ? mediaFileSizeRaw : null
  const thumbhash = (raw.thumbhash ?? null) as string | null
  const mediaWidthRaw = raw.mediaWidth ?? raw.media_width
  const mediaWidth =
    typeof mediaWidthRaw === 'number' && mediaWidthRaw > 0 ? mediaWidthRaw : null
  const mediaHeightRaw = raw.mediaHeight ?? raw.media_height
  const mediaHeight =
    typeof mediaHeightRaw === 'number' && mediaHeightRaw > 0 ? mediaHeightRaw : null
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
    mediaThumbUrl,
    mediaFileSize,
    thumbhash,
    mediaWidth,
    mediaHeight,
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
    starredAt: (raw.starredAt ?? raw.starred_at ?? null) as string | null,
    reactions: Array.isArray(raw.reactions)
      ? (raw.reactions as unknown as Array<Record<string, unknown>>).map((r) => ({
          emoji: String(r.emoji),
          agentId: String(r.agentId ?? r.agent_id),
          agentName: (r.agentName ?? r.agent_name ?? null) as string | null,
        }))
      : undefined,
    replyTo: normalizeReplyPreview(raw.replyTo),
    sentAt,
    createdAt,
    localPreviewUri: (raw.localPreviewUri ?? raw.local_preview_uri ?? undefined) as
      | string
      | undefined,
    localCacheUri: (raw.localCacheUri ?? raw.media_local_path ?? undefined) as
      | string
      | undefined,
    sendPhase: (raw.sendPhase ?? raw.send_phase ?? undefined) as Message['sendPhase'],
    metadata: (raw.metadata ?? null) as Record<string, unknown> | null,
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
