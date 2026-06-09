/** Session cache of resolved media display state — survives row unmounts. */

import { resolveMessageLocalMediaUri } from '@/lib/messageLocalMedia'
import type { Message } from '@/types'

export type CachedMediaDisplay = {
  uri: string
  width: number
  height: number
  type: 'image' | 'video' | 'audio'
  thumbnailUri?: string
  durationMs?: number
}

const MAX_ENTRIES = 5000
const cache = new Map<string, CachedMediaDisplay>()

function displayTypeForMessage(
  type: Message['type'],
): CachedMediaDisplay['type'] | null {
  if (type === 'video') return 'video'
  if (type === 'image' || type === 'sticker') return 'image'
  if (type === 'audio') return 'audio'
  return null
}

export const mediaDisplayCache = {
  get(messageId: string): CachedMediaDisplay | null {
    return cache.get(messageId) ?? null
  },

  has(messageId: string): boolean {
    return cache.has(messageId)
  },

  set(messageId: string, data: CachedMediaDisplay): void {
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    cache.set(messageId, data)
  },
}

/** Seed session cache from on-disk blobs so remounts never wait on async index reads. */
export function warmMediaDisplayCacheFromMessages(messages: Message[]): void {
  for (const msg of messages) {
    if (mediaDisplayCache.has(msg.id)) continue

    const displayType = displayTypeForMessage(msg.type)
    if (!displayType) continue

    const diskUri = resolveMessageLocalMediaUri(msg)
    if (!diskUri) continue

    mediaDisplayCache.set(msg.id, {
      uri: diskUri,
      width: msg.mediaWidth ?? 0,
      height: msg.mediaHeight ?? 0,
      type: displayType,
    })
  }
}
