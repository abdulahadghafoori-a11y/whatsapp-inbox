import sharp from 'sharp'
import { errors } from './errors.js'
import {
  WA_IMAGE_MAX_BYTES,
  WA_STICKER_MAX_BYTES,
  WA_PHOTO_MAX_EDGE,
  WA_STICKER_MAX_EDGE,
} from './wa-media-limits.js'

export {
  WA_IMAGE_MAX_BYTES,
  WA_STICKER_MAX_BYTES,
  WA_PHOTO_MAX_EDGE,
  WA_STICKER_MAX_EDGE,
} from './wa-media-limits.js'

const JPEG_QUALITIES = [85, 78, 72, 65, 58, 52] as const
const WEBP_QUALITIES = [80, 72, 65, 58, 50] as const

export type PreparedImage = {
  buffer: Buffer
  mime: string
  filename: string
}

function baseName(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

function withExt(filename: string, ext: string): string {
  return `${baseName(filename)}.${ext}`
}

function isStickerMime(mime: string, filename: string): boolean {
  const m = mime.toLowerCase()
  if (m === 'image/webp') return true
  return filename.toLowerCase().endsWith('.webp') && m.startsWith('image/')
}

async function encodeUnderCap(
  build: (quality: number) => Promise<Buffer>,
  maxBytes: number,
  qualities: readonly number[],
): Promise<Buffer | null> {
  for (const q of qualities) {
    const buf = await build(q)
    if (buf.length <= maxBytes) return buf
  }
  return null
}

async function shrinkPhotoToCap(
  input: sharp.Sharp,
  maxBytes: number,
  hasAlpha: boolean,
): Promise<Buffer> {
  let edge = WA_PHOTO_MAX_EDGE

  for (let attempt = 0; attempt < 6; attempt++) {
    let pipeline = input.clone().resize({
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true,
    })

    if (hasAlpha) {
      const level = Math.min(9, 3 + attempt)
      const buf = await pipeline.png({ compressionLevel: level, effort: 8 }).toBuffer()
      if (buf.length <= maxBytes) return buf
    } else {
      const buf = await encodeUnderCap(
        (q) => pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer(),
        maxBytes,
        JPEG_QUALITIES,
      )
      if (buf) return buf
    }

    edge = Math.round(edge * 0.82)
  }

  throw errors.mediaTooLarge(
    'Image is too large to send on WhatsApp even after compression. Try a smaller photo.',
  )
}

async function shrinkStickerToCap(input: sharp.Sharp, maxBytes: number): Promise<Buffer> {
  let edge = WA_STICKER_MAX_EDGE

  for (let attempt = 0; attempt < 5; attempt++) {
    const pipeline = input.clone().resize({
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true,
    })

    const buf = await encodeUnderCap(
      (q) => pipeline.webp({ quality: q }).toBuffer(),
      maxBytes,
      WEBP_QUALITIES,
    )
    if (buf) return buf

    edge = Math.round(edge * 0.85)
  }

  throw errors.mediaTooLarge(
    'Sticker is too large to send on WhatsApp even after compression.',
  )
}

/**
 * Resize, re-encode, and compress images like the WhatsApp client before Cloud API upload.
 * Large originals are reduced until they fit Meta limits — not rejected outright.
 */
export async function prepareImageForWhatsApp(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
  opts?: { kind?: 'image' | 'sticker' },
): Promise<PreparedImage> {
  let rotated: sharp.Sharp
  try {
    rotated = sharp(buffer, { failOn: 'none' }).rotate()
    await rotated.metadata()
  } catch {
    throw errors.validation('File is not a valid image.')
  }

  const meta = await rotated.metadata()
  const hasAlpha = !!meta.hasAlpha
  const sticker =
    opts?.kind === 'sticker' || (opts?.kind !== 'image' && isStickerMime(mimeHint, filename))

  if (sticker) {
    const out = await shrinkStickerToCap(rotated, WA_STICKER_MAX_BYTES)
    return {
      buffer: out,
      mime: 'image/webp',
      filename: withExt(filename, 'webp'),
    }
  }

  const maxBytes = WA_IMAGE_MAX_BYTES
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
  const mime = mimeHint.toLowerCase()
  const alreadySmall =
    buffer.length <= maxBytes &&
    longEdge > 0 &&
    longEdge <= WA_PHOTO_MAX_EDGE &&
    ((mime === 'image/jpeg' && !hasAlpha) || (mime === 'image/png' && hasAlpha))

  if (alreadySmall) {
    return {
      buffer,
      mime: hasAlpha ? 'image/png' : 'image/jpeg',
      filename: withExt(filename, hasAlpha ? 'png' : 'jpg'),
    }
  }

  const out = await shrinkPhotoToCap(rotated, maxBytes, hasAlpha)
  if (hasAlpha) {
    return { buffer: out, mime: 'image/png', filename: withExt(filename, 'png') }
  }
  return { buffer: out, mime: 'image/jpeg', filename: withExt(filename, 'jpg') }
}
