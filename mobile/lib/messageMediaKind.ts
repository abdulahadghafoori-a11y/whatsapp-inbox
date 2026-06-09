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

/** Images/stickers load from presigned URL + expo-image disk cache (no file-cache sync). */
export function isUrlFirstMediaType(type: MessageType): boolean {
  return type === 'image' || type === 'sticker'
}

/** Types that should be downloaded to the on-device blob store in the background. */
export function needsFileCacheSync(type: MessageType): boolean {
  return isHeavyMediaType(type) && !isUrlFirstMediaType(type)
}
