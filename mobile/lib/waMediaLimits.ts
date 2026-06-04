import * as FileSystem from 'expo-file-system/legacy'
import { messageTypeFromMime } from '@/lib/mediaMime'
import { resolveUploadUri } from '@/lib/uploadUri'

/** Mirror backend WhatsApp caps — used for pre-upload UX only; server enforces again. */
export const WA_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const WA_VIDEO_MAX_BYTES = 16 * 1024 * 1024
export const WA_AUDIO_MAX_BYTES = 16 * 1024 * 1024
export const WA_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024
export const WA_STICKER_MAX_BYTES = 500 * 1024

const SOFT_MULTIPLIER = 1.15

function capForMime(mime: string): number {
  const kind = messageTypeFromMime(mime)
  switch (kind) {
    case 'image':
      return WA_IMAGE_MAX_BYTES * SOFT_MULTIPLIER
    case 'video':
      return WA_VIDEO_MAX_BYTES * SOFT_MULTIPLIER
    case 'audio':
      return WA_AUDIO_MAX_BYTES * SOFT_MULTIPLIER
    case 'sticker':
      return WA_STICKER_MAX_BYTES * SOFT_MULTIPLIER
    default:
      return WA_DOCUMENT_MAX_BYTES
  }
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

/**
 * Fail fast on obviously oversized files (server still compresses images/video).
 */
export async function assertMediaUploadable(
  uri: string,
  mimeType: string,
  name: string,
): Promise<void> {
  const resolved = resolveUploadUri(uri)
  const info = await FileSystem.getInfoAsync(resolved)
  if (!info.exists) {
    throw new Error('File not found. Please try again.')
  }
  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0
  const cap = capForMime(mimeType)
  const kind = messageTypeFromMime(mimeType)

  if (size < 1) {
    throw new Error('File is empty.')
  }

  if (kind === 'document' && size > cap) {
    throw new Error(`Document is too large (max ${formatMb(WA_DOCUMENT_MAX_BYTES)} on WhatsApp).`)
  }

  if (kind === 'document') return

  if (size > cap) {
    if (kind === 'image' || kind === 'video') {
      return
    }
    throw new Error(
      `${kind === 'audio' ? 'Audio' : 'File'} is too large (max ${formatMb(cap)} on WhatsApp).`,
    )
  }
}
