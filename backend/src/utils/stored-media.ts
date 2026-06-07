import { mediaKindFromMime } from './wa-media-limits.js'

/** Whether outbound audio should use WhatsApp's voice-note flag. */
export function voiceNoteFromMime(mimeType: string): boolean {
  const m = mimeType.toLowerCase().split(';')[0].trim()
  return m.includes('ogg') || m.includes('opus')
}

export function waMimeFromStored(mimeType: string): string {
  return mimeType.split(';')[0].trim()
}

export function mediaTypeFromStoredMime(mimeType: string) {
  return mediaKindFromMime(mimeType)
}
