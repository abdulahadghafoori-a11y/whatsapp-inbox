import type { Message, MessageReaction } from '@/types'

function reactionsEqual(a?: MessageReaction[], b?: MessageReaction[]): boolean {
  const ar = a ?? []
  const br = b ?? []
  if (ar.length !== br.length) return false
  return ar.every(
    (r, i) => r.emoji === br[i]?.emoji && r.agentId === br[i]?.agentId,
  )
}

/** Shallow compare of message fields that affect bubble rendering. */
export function messageRenderEqual(a: Message, b: Message): boolean {
  if (a === b) return true
  const ar = a.replyTo
  const br = b.replyTo
  const replySame =
    ar === br ||
    (!!ar &&
      !!br &&
      ar.id === br.id &&
      ar.body === br.body &&
      ar.type === br.type &&
      // Quote preview also renders media + deletion state; compare them so the
      // quote thumbnail refreshes after the referenced media downloads/deletes.
      ar.mediaUrl === br.mediaUrl &&
      ar.localPreviewUri === br.localPreviewUri &&
      ar.deletedAt === br.deletedAt)
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.sendPhase === b.sendPhase &&
    a.body === b.body &&
    a.mediaStatus === b.mediaStatus &&
    a.mediaUrl === b.mediaUrl &&
    a.mediaThumbUrl === b.mediaThumbUrl &&
    a.mediaFileSize === b.mediaFileSize &&
    a.thumbhash === b.thumbhash &&
    a.mediaWidth === b.mediaWidth &&
    a.mediaHeight === b.mediaHeight &&
    a.starredAt === b.starredAt &&
    reactionsEqual(a.reactions, b.reactions) &&
    a.mediaMimeType === b.mediaMimeType &&
    a.mediaFilename === b.mediaFilename &&
    a.deletedAt === b.deletedAt &&
    a.localPreviewUri === b.localPreviewUri &&
    a.localCacheUri === b.localCacheUri &&
    a.errorMessage === b.errorMessage &&
    a.type === b.type &&
    a.sentAt === b.sentAt &&
    replySame
  )
}
