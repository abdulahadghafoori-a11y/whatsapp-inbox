import { useMemo } from 'react'
import { useMediaUrl } from '@/hooks/useMedia'
import { useCachedMedia } from '@/hooks/useCachedMediaUri'
import { resolveMessageLocalMediaUri } from '@/lib/messageLocalMedia'
import type { Message } from '@/types'

type MessageMediaInput = Pick<
  Message,
  | 'id'
  | 'conversationId'
  | 'type'
  | 'mediaUrl'
  | 'mediaThumbUrl'
  | 'mediaStatus'
  | 'localPreviewUri'
  | 'localCacheUri'
  | 'mediaMimeType'
  | 'mediaFilename'
>

function isLocalUri(uri: string) {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    (uri.startsWith('/') && !uri.startsWith('//'))
  )
}

/**
 * Resolve the best URI for displaying/playing media: on-device cache → local file → presigned S3.
 * Prefers local files so audio/video start instantly on repeat plays.
 */
export function useMessageMedia(
  message: MessageMediaInput,
  opts?: { loadRemote?: boolean },
) {
  const loadRemote = opts?.loadRemote !== false
  const pending = message.mediaStatus === 'pending'
  const hasRemoteKey = !!message.mediaUrl && !pending
  const messageLocalUri = useMemo(
    () => resolveMessageLocalMediaUri(message),
    [message.id, message.mediaUrl, message.localPreviewUri, message.localCacheUri],
  )
  const { uri: cachedUri, thumbUri: cachedThumbUri } = useCachedMedia(
    message.id,
    message.mediaUrl,
  )

  const thumbKey =
    hasRemoteKey && message.mediaThumbUrl && message.type !== 'video'
      ? message.mediaThumbUrl
      : null

  const { data: thumbUrl } = useMediaUrl(
    thumbKey && loadRemote && !messageLocalUri ? thumbKey : null,
    // Use the real message id (not a ":thumb" suffix) so the presign batch can
    // authorize it (server validates messageId as a UUID against the thumb key).
    // React Query keys stay distinct because the s3Key differs from the full media.
    message.id,
  )

  const { data: remoteUrl, isLoading: remoteLoading, isError: remoteError } = useMediaUrl(
    hasRemoteKey && loadRemote && !messageLocalUri ? message.mediaUrl : null,
    message.id,
  )

  const displayUrl = useMemo(() => {
    if (messageLocalUri) return messageLocalUri
    if (cachedUri) return cachedUri
    if (cachedThumbUri) return cachedThumbUri
    return thumbUrl ?? remoteUrl ?? null
  }, [messageLocalUri, cachedUri, cachedThumbUri, thumbUrl, remoteUrl])

  const playbackUrl = useMemo(
    () => (displayUrl && isLocalUri(displayUrl) ? displayUrl : displayUrl),
    [displayUrl],
  )

  const waitingForRemote =
    hasRemoteKey &&
    !messageLocalUri &&
    !cachedThumbUri &&
    remoteLoading &&
    !thumbUrl
  const failedRemote = hasRemoteKey && !messageLocalUri && remoteError

  return {
    displayUrl,
    playbackUrl,
    remoteUrl,
    cachedUri,
    isLoading: waitingForRemote,
    isError: failedRemote && !displayUrl,
  }
}
