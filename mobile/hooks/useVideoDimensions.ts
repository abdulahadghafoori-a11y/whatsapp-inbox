import { useEffect, useState } from 'react'
import { InteractionManager } from 'react-native'
import * as VideoThumbnails from 'expo-video-thumbnails'
import {
  getCachedMediaDimensions,
  updateCachedMediaDimensions,
} from '@/lib/messageMediaCache'
import { mediaDisplayCache } from '@/lib/mediaDisplayCache'
import { getVideoThumbnailSync } from '@/lib/videoThumbnailCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { PixelSize } from '@/hooks/useImageDimensions'

export type VideoPreviewMeta = PixelSize & { thumbUri: string }

function isLocalUri(uri: string) {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    (uri.startsWith('/') && !uri.startsWith('//'))
  )
}

function readCachedMeta(uri: string, messageId?: string): VideoPreviewMeta | null {
  if (messageId) {
    const display = mediaDisplayCache.get(messageId)
    if (display?.type === 'video' && display.width > 0 && display.height > 0) {
      const thumbUri =
        display.thumbnailUri ??
        (isLocalUri(uri) ? getVideoThumbnailSync(uri) ?? '' : '')
      return { width: display.width, height: display.height, thumbUri }
    }
  }
  if (isLocalUri(uri)) {
    const thumbUri = getVideoThumbnailSync(uri)
    if (thumbUri) return { width: 16, height: 9, thumbUri }
  }
  return null
}

function persistVideoMeta(messageId: string, uri: string, meta: VideoPreviewMeta) {
  mediaDisplayCache.set(messageId, {
    uri,
    width: meta.width,
    height: meta.height,
    type: 'video',
    thumbnailUri: meta.thumbUri || undefined,
  })
}

/**
 * Video aspect ratio + still frame for bubble layout.
 * Deferred until after scroll settles; skipped for off-screen rows.
 */
export function useVideoDimensions(
  uri: string | null | undefined,
  messageId?: string,
  active = true,
): VideoPreviewMeta | null {
  const [meta, setMeta] = useState<VideoPreviewMeta | null>(() =>
    uri ? readCachedMeta(uri, messageId) : null,
  )

  useEffect(() => {
    if (!uri || !active) return

    const cached = readCachedMeta(uri, messageId)
    if (cached) {
      setMeta(cached)
      return
    }

    let cancelled = false

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        if (messageId) {
          const dims = await getCachedMediaDimensions(messageId)
          if (dims && !cancelled) {
            const thumbUri = isLocalUri(uri) ? getVideoThumbnailSync(uri) ?? '' : ''
            const next = { ...dims, thumbUri }
            setMeta(next)
            if (messageId) persistVideoMeta(messageId, uri, next)
            return
          }
        }

        if (cancelled) return

        if (!isLocalUri(uri)) return

        try {
          const result = await VideoThumbnails.getThumbnailAsync(resolveUploadUri(uri), {
            time: 500,
            quality: 0.55,
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
            persistVideoMeta(messageId, uri, next)
          }
        } catch {
          if (!cancelled) {
            setMeta({ width: 16, height: 9, thumbUri: '' })
          }
        }
      })()
    })

    return () => {
      cancelled = true
      task.cancel()
    }
  }, [uri, messageId, active])

  return meta
}
