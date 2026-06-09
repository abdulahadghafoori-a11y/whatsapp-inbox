import {
  aliasMessageToBlob,
  ensureMediaIndexLoaded,
  getCachedMediaUri,
  getCachedMediaUriSync,
} from '@/lib/messageMediaCache'
import { resolveMessageLocalMediaUri } from '@/lib/messageLocalMedia'
import {
  queueMessageMediaSync,
  syncMessageMedia,
  type SyncableMediaMessage,
} from '@/lib/messageMediaSync'

/** Best URI for playback: on-device file first, then stream URL (cache fills in background). */
export async function resolvePlaybackUri(
  message: SyncableMediaMessage,
  remoteUrl?: string | null,
): Promise<string | null> {
  await ensureMediaIndexLoaded()

  const local = resolveMessageLocalMediaUri(message)
  if (local) {
    if (!getCachedMediaUriSync(message.id) && message.mediaUrl?.startsWith('media/')) {
      void aliasMessageToBlob(message.id, message.mediaUrl)
    }
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
  message: Pick<
    SyncableMediaMessage,
    'id' | 'mediaUrl' | 'localPreviewUri' | 'localCacheUri'
  >,
  remoteUrl?: string | null,
): string | null {
  const local = resolveMessageLocalMediaUri(message)
  if (local) return local
  return remoteUrl ?? null
}

export async function warmPlaybackCache(
  message: SyncableMediaMessage,
  remoteUrl?: string | null,
): Promise<string | null> {
  const sync = resolvePlaybackUriSync(message, remoteUrl)
  if (sync && !sync.startsWith('http')) return sync

  const cached = await getCachedMediaUri(message.id)
  if (cached) return cached

  return resolvePlaybackUri(message, remoteUrl)
}
