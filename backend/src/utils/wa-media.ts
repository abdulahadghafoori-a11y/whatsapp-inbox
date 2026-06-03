const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker'])

export function isMediaMessageType(type: string): boolean {
  return MEDIA_TYPES.has(type)
}

/** WhatsApp media id from webhook metadata (`image.id`, `audio.id`, …). */
export function waMediaIdFromMetadata(
  metadata: unknown,
  type: string,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const block = (metadata as Record<string, unknown>)[type]
  if (!block || typeof block !== 'object') return null
  const id = (block as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}
