import { errors } from './errors.js'

/** m4a/mp4 container starts with size + "ftyp" at offset 4. */
export function looksLikeMp4(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false
  const head = buffer.subarray(0, Math.min(buffer.length, 32_768)).toString('latin1')
  return head.includes('moov') || head.includes('mdat') || head.includes('mp4a')
}

/** AMR-NB narrowband files start with #!AMR\n */
export function looksLikeAmr(buffer: Buffer): boolean {
  if (buffer.length < 6) return false
  return buffer.subarray(0, 5).toString('ascii') === '#!AMR'
}

export function mp4Brand(buffer: Buffer): string | null {
  if (buffer.length < 12) return null
  if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return null
  return buffer.subarray(8, 12).toString('ascii')
}

/**
 * Reject corrupt recordings before WhatsApp upload (avoids API 200 + webhook failed).
 */
export function assertValidOutboundAudio(buffer: Buffer, mime: string): void {
  if (buffer.length < 200) {
    throw errors.validation('Recording is too short or empty. Record at least one second.')
  }

  const m = mime.toLowerCase()
  if (m === 'audio/amr' || m === 'audio/3gp') {
    if (!looksLikeAmr(buffer)) {
      throw errors.validation(
        'Invalid voice recording (AMR). Please record again.',
      )
    }
    return
  }

  if (m === 'audio/mp4' || m === 'audio/aac' || m === 'audio/m4a') {
    if (!looksLikeMp4(buffer)) {
      throw errors.validation(
        'Invalid voice recording (not a valid audio file). Please record again.',
      )
    }
    return
  }
}

/** MIME for WhatsApp media upload `type` field (must match real container). */
export function whatsappAudioMime(mime: string, filename: string): string {
  const lower = mime.toLowerCase()
  const ext = filename.toLowerCase()
  if (ext.endsWith('.3gp') || ext.endsWith('.amr') || lower.includes('amr')) {
    return 'audio/amr'
  }
  if (
    ext.endsWith('.m4a') ||
    lower === 'audio/mp4' ||
    lower === 'audio/aac' ||
    lower === 'audio/m4a' ||
    lower === 'audio/x-m4a'
  ) {
    return 'audio/mp4'
  }
  return mime
}
