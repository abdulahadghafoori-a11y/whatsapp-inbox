/** Session cache of resolved media display state — survives row unmounts. */

export type CachedMediaDisplay = {
  uri: string
  width: number
  height: number
  type: 'image' | 'video'
  thumbnailUri?: string
}

const MAX_ENTRIES = 5000
const cache = new Map<string, CachedMediaDisplay>()

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
