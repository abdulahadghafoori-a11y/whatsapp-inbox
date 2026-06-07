import { errors } from './errors.js'
import { WA_VIDEO_MAX_BYTES, WA_VIDEO_MAX_DURATION_SEC } from './wa-media-limits.js'

export type ValidatedVideo = {
  buffer: Buffer
  mime: string
  filename: string
}

function looksLikeMp4(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
}

function baseName(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

function withMp4(filename: string): string {
  return `${baseName(filename)}.mp4`
}

/** Rough duration from MP4 `mvhd` box when present (client should enforce limits too). */
function estimateMp4DurationSec(buffer: Buffer): number | null {
  const idx = buffer.indexOf('mvhd')
  if (idx < 0 || idx + 24 > buffer.length) return null
  const version = buffer[idx + 4]
  try {
    if (version === 0) {
      const timescale = buffer.readUInt32BE(idx + 16)
      const duration = buffer.readUInt32BE(idx + 20)
      if (!timescale) return null
      return duration / timescale
    }
    if (version === 1 && idx + 36 <= buffer.length) {
      const timescale = buffer.readUInt32BE(idx + 28)
      const durationHi = buffer.readUInt32BE(idx + 32)
      const durationLo = buffer.readUInt32BE(idx + 36)
      const duration = durationHi * 2 ** 32 + durationLo
      if (!timescale) return null
      return duration / timescale
    }
  } catch {
    return null
  }
  return null
}

/**
 * Client prepares video (trim/compress on device). Server validates container and caps.
 */
export function validateVideoForWhatsApp(buffer: Buffer, filename: string, mimeHint: string): ValidatedVideo {
  if (buffer.length < 400) {
    throw errors.validation('Video file is empty or invalid.')
  }

  if (!looksLikeMp4(buffer)) {
    throw errors.validation(
      'Video must be MP4 (H.264). Trim or compress in the app before sending.',
    )
  }

  const mime = mimeHint.toLowerCase().startsWith('video/') ? 'video/mp4' : 'video/mp4'
  if (buffer.length > WA_VIDEO_MAX_BYTES) {
    throw errors.mediaTooLarge(
      `Video is too large (${Math.round(buffer.length / (1024 * 1024))}MB, max 16MB). Trim in the app and try again.`,
    )
  }

  const durationSec = estimateMp4DurationSec(buffer)
  if (durationSec != null && durationSec > WA_VIDEO_MAX_DURATION_SEC) {
    // Trim/compress can leave stale moov duration while the clip is small — trust size cap.
    if (buffer.length > WA_VIDEO_MAX_BYTES * 0.9) {
      throw errors.validation(
        `Video is too long (${Math.ceil(durationSec / 60)} min). WhatsApp allows up to 16 minutes.`,
      )
    }
  }

  return {
    buffer,
    mime,
    filename: withMp4(filename),
  }
}
