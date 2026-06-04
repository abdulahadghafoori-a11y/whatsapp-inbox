/** WhatsApp Cloud API media limits (aligned with official client behavior). */

export const WA_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const WA_STICKER_MAX_BYTES = 500 * 1024
export const WA_VIDEO_MAX_BYTES = 16 * 1024 * 1024
export const WA_AUDIO_MAX_BYTES = 16 * 1024 * 1024
export const WA_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024

export const WA_PHOTO_MAX_EDGE = 1600
export const WA_STICKER_MAX_EDGE = 512

/** Long edge for outbound video (WhatsApp-style downscale before send). */
export const WA_VIDEO_MAX_EDGE = 1280
export const WA_VIDEO_MAX_DURATION_SEC = 16 * 60

export type WaMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export const MEDIA_CAPS: Record<WaMediaKind, number> = {
  image: WA_IMAGE_MAX_BYTES,
  video: WA_VIDEO_MAX_BYTES,
  audio: WA_AUDIO_MAX_BYTES,
  document: WA_DOCUMENT_MAX_BYTES,
  sticker: WA_STICKER_MAX_BYTES,
}

export function mediaKindFromMime(mime: string): WaMediaKind {
  const m = mime.toLowerCase().split(';')[0].trim()
  if (m.startsWith('image/')) return m === 'image/webp' ? 'sticker' : 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'document'
}

export function capForMime(mime: string): number {
  return MEDIA_CAPS[mediaKindFromMime(mime)] ?? WA_DOCUMENT_MAX_BYTES
}
