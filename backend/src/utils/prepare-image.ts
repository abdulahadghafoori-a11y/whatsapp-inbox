import { errors } from './errors.js'
import {
  WA_IMAGE_MAX_BYTES,
  WA_STICKER_MAX_BYTES,
} from './wa-media-limits.js'

export {
  WA_IMAGE_MAX_BYTES,
  WA_STICKER_MAX_BYTES,
  WA_PHOTO_MAX_EDGE,
  WA_STICKER_MAX_EDGE,
} from './wa-media-limits.js'

export type PreparedImage = {
  buffer: Buffer
  mime: string
  filename: string
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png'])
const ALLOWED_STICKER_MIMES = new Set(['image/webp'])

function baseName(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

function withExt(filename: string, ext: string): string {
  return `${baseName(filename)}.${ext}`
}

function isStickerMime(mime: string, filename: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  if (m === 'image/webp') return true
  return filename.toLowerCase().endsWith('.webp') && m.startsWith('image/')
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').trim()
  return base.slice(0, 240) || `image-${Date.now()}.jpg`
}

/**
 * Validate client-prepared images (no server re-encode).
 * Mobile compresses with expo-image-manipulator before upload.
 */
export async function validateImageForWhatsApp(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
  opts?: { kind?: 'image' | 'sticker' },
): Promise<PreparedImage> {
  if (buffer.length < 1) {
    throw errors.validation('Image file is empty.')
  }

  const mime = mimeHint.toLowerCase().split(';')[0].trim()
  const safeName = sanitizeFilename(filename)
  const sticker =
    opts?.kind === 'sticker' || (opts?.kind !== 'image' && isStickerMime(mimeHint, filename))

  if (sticker) {
    if (!ALLOWED_STICKER_MIMES.has(mime)) {
      throw errors.validation('Stickers must be WebP.')
    }
    if (buffer.length > WA_STICKER_MAX_BYTES) {
      throw errors.mediaTooLarge(
        `Sticker exceeds WhatsApp's ${Math.round(WA_STICKER_MAX_BYTES / 1024)}KB limit.`,
      )
    }
    return {
      buffer,
      mime: 'image/webp',
      filename: withExt(safeName, 'webp'),
    }
  }

  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw errors.validation('Images must be JPEG or PNG. Re-send from the app gallery.')
  }

  if (buffer.length > WA_IMAGE_MAX_BYTES) {
    throw errors.mediaTooLarge(
      `Image exceeds WhatsApp's ${Math.round(WA_IMAGE_MAX_BYTES / (1024 * 1024))}MB limit.`,
    )
  }

  const ext = mime === 'image/png' ? 'png' : 'jpg'
  return {
    buffer,
    mime,
    filename: withExt(safeName, ext),
  }
}

/** @deprecated Use validateImageForWhatsApp — kept for import compatibility during transition */
export const prepareImageForWhatsApp = validateImageForWhatsApp
