import { useMemo } from 'react'
import { useCachedMedia } from '@/hooks/useCachedMediaUri'
import { useMessageMedia } from '@/hooks/useMessageMedia'
import type { Message } from '@/types'

type DisplayMediaMessage = Pick<
  Message,
  | 'id'
  | 'type'
  | 'direction'
  | 'mediaUrl'
  | 'mediaThumbUrl'
  | 'mediaStatus'
  | 'localPreviewUri'
  | 'localCacheUri'
  | 'mediaMimeType'
  | 'mediaFilename'
>
import { mediaDisplayCache } from '@/lib/mediaDisplayCache'
import { resolveMessageLocalMediaUri } from '@/lib/messageLocalMedia'

/** Unified display URI resolution for chat media bubbles and quote previews. */
export function useDisplayMediaUri(
  message: DisplayMediaMessage,
  opts?: { loadRemote?: boolean },
) {
  const { uri: cachedUri, thumbUri: cachedThumbUri } = useCachedMedia(
    message.id,
    message.mediaUrl,
  )
  const localUri = useMemo(
    () => resolveMessageLocalMediaUri(message),
    [message.id, message.mediaUrl, message.localPreviewUri, message.localCacheUri, cachedUri],
  )

  const { displayUrl, playbackUrl, remoteUrl, isLoading, isError } = useMessageMedia(message, opts)

  const sessionDisplay = mediaDisplayCache.get(message.id)

  const effectiveDisplayUrl = useMemo(
    () =>
      displayUrl ??
      sessionDisplay?.uri ??
      localUri ??
      cachedUri ??
      cachedThumbUri ??
      null,
    [displayUrl, sessionDisplay?.uri, localUri, cachedUri, cachedThumbUri],
  )

  const effectivePlaybackUrl = playbackUrl ?? effectiveDisplayUrl

  return {
    localUri,
    cachedUri,
    cachedThumbUri,
    displayUrl,
    effectiveDisplayUrl,
    effectivePlaybackUrl,
    remoteUrl,
    sessionDisplay,
    isLoading,
    isError,
  }
}
