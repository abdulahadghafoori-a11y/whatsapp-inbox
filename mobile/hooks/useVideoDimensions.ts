import { useEffect, useState } from 'react'
import * as VideoThumbnails from 'expo-video-thumbnails'
import {
  getCachedMediaDimensions,
  updateCachedMediaDimensions,
} from '@/lib/messageMediaCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { PixelSize } from '@/hooks/useImageDimensions'

export type VideoPreviewMeta = PixelSize & { thumbUri: string }

/**
 * Intrinsic video aspect ratio + still frame for bubble layout.
 * Reuses cached dimensions when the file was saved for offline use.
 */
export function useVideoDimensions(
  uri: string | null | undefined,
  messageId?: string,
): VideoPreviewMeta | null {
  const [meta, setMeta] = useState<VideoPreviewMeta | null>(null)

  useEffect(() => {
    if (!uri) {
      setMeta(null)
      return
    }

    let cancelled = false
    setMeta(null)

    void (async () => {
      if (messageId) {
        const cached = await getCachedMediaDimensions(messageId)
        if (cached && !cancelled) {
          setMeta({ ...cached, thumbUri: '' })
        }
      }

      try {
        const result = await VideoThumbnails.getThumbnailAsync(resolveUploadUri(uri), {
          time: 500,
          quality: 0.65,
        })
        if (cancelled) return
        const next: VideoPreviewMeta = {
          width: result.width > 0 ? result.width : 16,
          height: result.height > 0 ? result.height : 9,
          thumbUri: result.uri,
        }
        setMeta(next)
        if (messageId && result.width > 0 && result.height > 0) {
          void updateCachedMediaDimensions(messageId, result.width, result.height)
        }
      } catch {
        if (!cancelled) {
          setMeta({ width: 16, height: 9, thumbUri: '' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [uri, messageId])

  return meta
}
