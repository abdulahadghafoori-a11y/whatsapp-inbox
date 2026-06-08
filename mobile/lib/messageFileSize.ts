import type { Message } from '@/types'

function readSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** File size from DB column or message metadata fallback. */
export function messageFileSizeBytes(message: Message): number | null {
  if (message.mediaFileSize && message.mediaFileSize > 0) return message.mediaFileSize

  const meta = message.metadata
  if (!meta || typeof meta !== 'object') return null

  const direct = readSize(meta.file_size) ?? readSize(meta.fileSize)
  if (direct) return direct

  const typeKey = message.type === 'audio' ? 'audio' : message.type
  const nested = meta[typeKey]
  if (nested && typeof nested === 'object') {
    const fromNested =
      readSize((nested as Record<string, unknown>).file_size) ??
      readSize((nested as Record<string, unknown>).fileSize)
    if (fromNested) return fromNested
  }

  const document = meta.document
  if (document && typeof document === 'object') {
    return readSize((document as Record<string, unknown>).file_size)
  }

  return null
}
