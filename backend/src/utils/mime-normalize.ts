/** MIME types accepted by the WhatsApp Cloud API media upload endpoint. */
const WA_AUDIO = new Set([
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/opus',
])

/**
 * Normalize client-reported MIME (e.g. iOS `audio/x-m4a`) before WhatsApp upload.
 */
export function normalizeWhatsAppMime(mime: string, filename: string): string {
  const lower = mime.toLowerCase().trim()
  const ext = filename.toLowerCase()

  if (
    lower === 'audio/3gpp' ||
    lower === 'audio/3gp' ||
    ext.endsWith('.3gp') ||
    ext.endsWith('.amr')
  ) {
    return 'audio/amr'
  }
  if (lower === 'audio/x-m4a' || lower === 'audio/m4a' || ext.endsWith('.m4a')) {
    return 'audio/mp4'
  }
  if (lower.startsWith('audio/')) {
    if (WA_AUDIO.has(lower)) return lower
    return 'audio/mp4'
  }

  if (lower.startsWith('video/')) {
    if (lower === 'video/quicktime' || ext.endsWith('.mov')) return 'video/mp4'
    return lower
  }

  if (lower === 'application/octet-stream' || !lower) {
    if (ext.endsWith('.3gp') || ext.endsWith('.amr')) return 'audio/amr'
    if (ext.endsWith('.m4a')) return 'audio/mp4'
    if (ext.endsWith('.mp3')) return 'audio/mpeg'
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg'
    if (ext.endsWith('.png')) return 'image/png'
    if (ext.endsWith('.webp')) return 'image/webp'
    if (ext.endsWith('.mp4') || ext.endsWith('.mov')) return 'video/mp4'
    if (ext.endsWith('.pdf')) return 'application/pdf'
  }

  return mime
}

/**
 * WhatsApp only supports `voice: true` with OGG/Opus.
 * m4a/amr must be sent as regular audio or delivery fails after API accept.
 */
export function shouldSendAsVoiceNote(mime: string): boolean {
  const m = mime.toLowerCase()
  return m === 'audio/ogg' || m === 'audio/opus'
}
