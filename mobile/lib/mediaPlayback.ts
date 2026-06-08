import {
  aliasMessageToBlob,
  ensureMediaIndexLoaded,
  getCachedMediaUri,
  getCachedMediaUriSync,
  resolveCachedMediaUriSync,
} from '@/lib/messageMediaCache'
import {
  queueMessageMediaSync,
  syncMessageMedia,
  type SyncableMediaMessage,
} from '@/lib/messageMediaSync'
import { resolveUploadUri } from '@/lib/uploadUri'

/** Best URI for playback: on-device file first, then stream URL (cache fills in background). */
export async function resolvePlaybackUri(
  message: SyncableMediaMessage,
  remoteUrl?: string | null,
): Promise<string | null> {
  await ensureMediaIndexLoaded()

  const cached = resolveCachedMediaUriSync(message.id, message.mediaUrl)
  if (cached) {
    if (!getCachedMediaUriSync(message.id) && message.mediaUrl?.startsWith('media/')) {
      void aliasMessageToBlob(message.id, message.mediaUrl)
    }
    return cached
  }

  if (message.localPreviewUri) {
    const local = resolveUploadUri(message.localPreviewUri)
    queueMessageMediaSync(message)
    return local
  }

  if (remoteUrl) {
    queueMessageMediaSync(message)
    return remoteUrl
  }

  const synced = await syncMessageMedia(message)
  return synced
}

/** Fast path when the file is already on disk (no network). */
export function resolvePlaybackUriSync(
  messageId: string,
  localPreviewUri?: string | null,
  remoteUrl?: string | null,
  mediaUrl?: string | null,
): string | null {
  const cached = resolveCachedMediaUriSync(messageId, mediaUrl)
  if (cached) return cached
  if (localPreviewUri) return resolveUploadUri(localPreviewUri)
  return remoteUrl ?? null
}

export async function warmPlaybackCache(
  message: SyncableMediaMessage,
  remoteUrl?: string | null,
): Promise<string | null> {
  const sync = resolvePlaybackUriSync(
    message.id,
    message.localPreviewUri,
    remoteUrl,
    message.mediaUrl,
  )
  if (sync && !sync.startsWith('http')) return sync

  const cached = await getCachedMediaUri(message.id)
  if (cached) return cached

  return resolvePlaybackUri(message, remoteUrl)
}
