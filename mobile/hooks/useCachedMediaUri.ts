import { useSyncExternalStore } from 'react'
import {
  aliasMessageToBlob,
  ensureMediaIndexLoaded,
  getCachedMediaUriSync,
  getCachedUriForS3KeySync,
  resolveCachedMediaThumbUriSync,
  resolveCachedMediaUriSync,
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
export function useCachedMediaThumbUri(
  messageId: string | undefined,
  mediaUrl?: string | null,
) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () =>
      messageId ? resolveCachedMediaThumbUriSync(messageId, mediaUrl) : null,
    () => null,
  )
}

const EMPTY_MEDIA = { uri: null as string | null, thumbUri: null as string | null }
/** Memoized snapshots so useSyncExternalStore keeps a stable reference per message. */
const mediaSnapshotCache = new Map<string, { uri: string | null; thumbUri: string | null }>()

function snapshotCacheKey(messageId: string, mediaUrl?: string | null) {
  return mediaUrl ? `${messageId}\0${mediaUrl}` : messageId
}

function getMediaSnapshot(messageId: string, mediaUrl?: string | null) {
  const uri = resolveCachedMediaUriSync(messageId, mediaUrl)
  const thumbUri = resolveCachedMediaThumbUriSync(messageId, mediaUrl)
  const key = snapshotCacheKey(messageId, mediaUrl)
  const prev = mediaSnapshotCache.get(key)
  if (prev && prev.uri === uri && prev.thumbUri === thumbUri) return prev
  const next = { uri, thumbUri }
  mediaSnapshotCache.set(key, next)
  return next
}

/** Combined cache read (full + thumb) using a single subscription per message. */
export function useCachedMedia(
  messageId: string | undefined,
  mediaUrl?: string | null,
) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  useEffect(() => {
    if (!messageId || !mediaUrl?.startsWith('media/')) return
    if (getCachedMediaUriSync(messageId)) return
    if (!getCachedUriForS3KeySync(mediaUrl)) return
    void aliasMessageToBlob(messageId, mediaUrl)
  }, [messageId, mediaUrl])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () => (messageId ? getMediaSnapshot(messageId, mediaUrl) : EMPTY_MEDIA),
    () => EMPTY_MEDIA,
  )
}

/** On-device path for a message, including files cached under the same S3 key. */
export function useResolvedCachedMediaUri(
  messageId: string | undefined,
  mediaUrl?: string | null,
) {
  const { uri } = useCachedMedia(messageId, mediaUrl)
  return uri
}
