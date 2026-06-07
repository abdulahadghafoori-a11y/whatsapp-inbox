import { useMemo } from 'react'
import { useMediaUrl } from '@/hooks/useMedia'
import { useCachedMediaUri } from '@/hooks/useCachedMediaUri'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { Message } from '@/types'

type MessageMediaInput = Pick<
  Message,
  | 'id'
  | 'conversationId'
  | 'type'
  | 'mediaUrl'
  | 'mediaStatus'
  | 'localPreviewUri'
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
export function useMessageMedia(message: MessageMediaInput) {
  const pending = message.mediaStatus === 'pending'
  const hasRemoteKey = !!message.mediaUrl && !pending
  const cachedUri = useCachedMediaUri(message.id)

  const { data: remoteUrl, isLoading: remoteLoading, isError: remoteError } = useMediaUrl(
    hasRemoteKey && !cachedUri && !message.localPreviewUri ? message.mediaUrl : null,
    message.id,
  )

  const displayUrl = useMemo(() => {
    if (cachedUri) return cachedUri
    if (message.localPreviewUri) return resolveUploadUri(message.localPreviewUri)
    return remoteUrl ?? null
  }, [cachedUri, message.localPreviewUri, remoteUrl])

  const playbackUrl = useMemo(
    () => (displayUrl && isLocalUri(displayUrl) ? displayUrl : displayUrl),
    [displayUrl],
  )

  const waitingForRemote =
    hasRemoteKey && !cachedUri && !message.localPreviewUri && remoteLoading
  const failedRemote =
    hasRemoteKey && !cachedUri && !message.localPreviewUri && remoteError

  return {
    displayUrl,
    playbackUrl,
    remoteUrl,
    cachedUri,
    isLoading: waitingForRemote,
    isError: failedRemote && !displayUrl,
  }
}
