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

/** SHA-256 of the WhatsApp-hosted file (webhook + Media API) — same bytes → same hash. */
export function waContentSha256FromMetadata(
  metadata: unknown,
  type: string,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const block = (metadata as Record<string, unknown>)[type]
  if (!block || typeof block !== 'object') return null
  const sha = (block as { sha256?: unknown }).sha256
  if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/i.test(sha)) return null
  return sha.toLowerCase()
}

/** File size in bytes when WhatsApp includes it on the media object (documents, etc.). */
export function waFileSizeFromMetadata(metadata: unknown, type: string): number | null {
  if (!metadata || typeof metadata !== 'object') return null
  const block = (metadata as Record<string, unknown>)[type]
  if (!block || typeof block !== 'object') return null
  const raw = (block as { file_size?: unknown }).file_size
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
