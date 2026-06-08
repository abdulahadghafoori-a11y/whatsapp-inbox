import * as VideoThumbnails from 'expo-video-thumbnails'
import { resolveUploadUri } from '@/lib/uploadUri'

const THUMB_TIME_MS = 500
const THUMB_QUALITY = 0.55
const GEN_TIMEOUT_MS = 12_000

/** Session cache of generated thumbnails (resolved uri → thumb uri). */
const cache = new Map<string, string>()
/** In-flight generations so concurrent bubbles share one decode. */
const inflight = new Map<string, Promise<string | null>>()

/** Synchronously read an already-generated thumbnail (avoids a render flash). */
export function getVideoThumbnailSync(uri: string): string | null {
  return cache.get(resolveUploadUri(uri)) ?? null
}

/**
 * Generate a video thumbnail at most once per source uri. Repeated mounts or
 * scroll in/out reuse the cached result instead of re-decoding the video.
 */
export function getVideoThumbnail(uri: string): Promise<string | null> {
  const resolved = resolveUploadUri(uri)
  const cached = cache.get(resolved)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(resolved)
  if (existing) return existing

  const task = (async () => {
    try {
      const gen = VideoThumbnails.getThumbnailAsync(resolved, {
        time: THUMB_TIME_MS,
        quality: THUMB_QUALITY,
      })
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('thumbnail_timeout')), GEN_TIMEOUT_MS)
      })
      const { uri: generated } = await Promise.race([gen, timeout])
      cache.set(resolved, generated)
      return generated
    } catch {
      return null
    } finally {
      inflight.delete(resolved)
    }
  })()
  inflight.set(resolved, task)
  return task
}
