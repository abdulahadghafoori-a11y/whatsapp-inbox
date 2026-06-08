import { useSyncExternalStore } from 'react'
import {
  ensureMediaIndexLoaded,
  getCachedMediaThumbUriSync,
  getCachedMediaUriSync,
  subscribeMessageMediaCache,
} from '@/lib/messageMediaCache'
import { useEffect } from 'react'

let indexBootstrapped = false

function bootstrapIndex() {
  if (indexBootstrapped) return
  indexBootstrapped = true
  void ensureMediaIndexLoaded()
}

/** On-device media path for a message (sync after index load, updates when cache writes). */
export function useCachedMediaUri(messageId: string | undefined) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () => (messageId ? getCachedMediaUriSync(messageId) : null),
    () => null,
  )
}

/** On-device JPEG thumb (generated when full image is cached). */
export function useCachedMediaThumbUri(messageId: string | undefined) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () => (messageId ? getCachedMediaThumbUriSync(messageId) : null),
    () => null,
  )
}

const EMPTY_MEDIA = { uri: null as string | null, thumbUri: null as string | null }
/** Memoized snapshots so useSyncExternalStore keeps a stable reference per message. */
const mediaSnapshotCache = new Map<string, { uri: string | null; thumbUri: string | null }>()

function getMediaSnapshot(messageId: string) {
  const uri = getCachedMediaUriSync(messageId)
  const thumbUri = getCachedMediaThumbUriSync(messageId)
  const prev = mediaSnapshotCache.get(messageId)
  if (prev && prev.uri === uri && prev.thumbUri === thumbUri) return prev
  const next = { uri, thumbUri }
  mediaSnapshotCache.set(messageId, next)
  return next
}

/** Combined cache read (full + thumb) using a single subscription per message. */
export function useCachedMedia(messageId: string | undefined) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () => (messageId ? getMediaSnapshot(messageId) : EMPTY_MEDIA),
    () => EMPTY_MEDIA,
  )
}
