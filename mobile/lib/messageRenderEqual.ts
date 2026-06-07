import type { Message } from '@/types'

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
      ar.type === br.type)
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.sendPhase === b.sendPhase &&
    a.body === b.body &&
    a.mediaStatus === b.mediaStatus &&
    a.mediaUrl === b.mediaUrl &&
    a.mediaMimeType === b.mediaMimeType &&
    a.mediaFilename === b.mediaFilename &&
    a.deletedAt === b.deletedAt &&
    a.localPreviewUri === b.localPreviewUri &&
    a.errorMessage === b.errorMessage &&
    a.type === b.type &&
    a.sentAt === b.sentAt &&
    replySame
  )
}
