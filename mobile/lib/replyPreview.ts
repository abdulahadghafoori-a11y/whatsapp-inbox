import type { Message, MessageReplyPreview } from '@/types'

export function messageToReplyPreview(message: Message): MessageReplyPreview {
  return {
    id: message.id,
    direction: message.direction,
    type: message.type,
    body: message.body,
    deletedAt: message.deletedAt ?? null,
    mediaUrl: message.mediaUrl,
    mediaMimeType: message.mediaMimeType,
    mediaFilename: message.mediaFilename,
    localPreviewUri: message.localPreviewUri ?? null,
  }
}

export function replyHasMediaThumb(reply: MessageReplyPreview): boolean {
  if (reply.deletedAt) return false
  if (reply.localPreviewUri) return true
  if (reply.mediaUrl && (reply.type === 'image' || reply.type === 'video' || reply.type === 'sticker')) {
    return true
  }
  return false
}

export function replyPreviewLabel(
  reply: MessageReplyPreview,
  contactName: string,
): string {
  if (reply.deletedAt) return 'Message deleted'
  if (reply.direction === 'outbound') return 'You'
  return contactName
}

export function replyPreviewSnippet(reply: MessageReplyPreview): string {
  if (reply.deletedAt) return 'Message deleted'
  if (reply.body?.trim()) return reply.body.trim()
  switch (reply.type) {
    case 'image':
      return 'Photo'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Voice message'
    case 'document':
      return 'Document'
    case 'sticker':
      return 'Sticker'
    case 'location':
      return 'Location'
    default:
      return 'Message'
  }
}
