import { getCachedMediaUriSync } from '@/lib/messageMediaCache'
import type { Message, MessageType } from '@/types'

const FORWARDABLE_MEDIA_TYPES = new Set<MessageType>([
  'image',
  'video',
  'sticker',
  'audio',
  'document',
])

/** True when media bytes are on-device (or outbound was sent with a stored key). */
export function isMessageMediaLocallyPresent(message: Message): boolean {
  if (message.localPreviewUri) return true
  if (getCachedMediaUriSync(message.id)) return true
  if (
    message.direction === 'outbound' &&
    message.mediaUrl &&
    message.status !== 'pending' &&
    !message.id.startsWith('pending-media-') &&
    !message.sendPhase
  ) {
    return true
  }
  return false
}

/** True when a media message can be forwarded (sent/received, not pending). */
export function canForwardMediaMessage(message: Message): boolean {
  if (message.deletedAt) return false
  if (!FORWARDABLE_MEDIA_TYPES.has(message.type)) return false
  if (message.status === 'failed') return false
  if (
    message.status === 'pending' ||
    message.id.startsWith('pending-media-') ||
    message.id.startsWith('pending-text-') ||
    message.sendPhase
  ) {
    return false
  }
  if (message.direction === 'inbound' && message.mediaStatus === 'failed') return false
  return isMessageMediaLocallyPresent(message)
}

export function isVisualForwardableMedia(message: Message): boolean {
  return (
    (message.type === 'image' || message.type === 'video' || message.type === 'sticker') &&
    canForwardMediaMessage(message)
  )
}
