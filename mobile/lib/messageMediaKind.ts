import type { MessageType } from '@/types'

/** Stickers behave like text for loading: always when visible, no Storage & data gate. */
export function isStickerType(type: MessageType): boolean {
  return type === 'sticker'
}

export function isTextLikeType(type: MessageType): boolean {
  return type === 'text' || type === 'location' || type === 'sticker'
}

/** Heavy auto-download / background sync (photos, video, audio, docs). */
export function isHeavyMediaType(type: MessageType): boolean {
  return !isTextLikeType(type) && type !== 'contacts' && type !== 'interactive' && type !== 'button'
}
