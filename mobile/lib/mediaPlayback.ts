import {
  ensureMediaIndexLoaded,
  getCachedMediaUri,
  getCachedMediaUriSync,
} from '@/lib/messageMediaCache'
import { syncMessageMedia, type SyncableMediaMessage } from '@/lib/messageMediaSync'
import { resolveUploadUri } from '@/lib/uploadUri'

/** Best URI for playback: on-device file first, then in-flight local, then remote. */
export async function resolvePlaybackUri(
  message: SyncableMediaMessage,
  remoteUrl?: string | null,
): Promise<string | null> {
  await ensureMediaIndexLoaded()

  const cached = await getCachedMediaUri(message.id)
  if (cached) return cached

  if (message.localPreviewUri) {
    const local = resolveUploadUri(message.localPreviewUri)
    void syncMessageMedia(message)
    return local
  }

  const synced = await syncMessageMedia(message)
  if (synced) return synced

  if (remoteUrl) return remoteUrl
  return null
}

/** Fast path when the file is already on disk (no network). */
export function resolvePlaybackUriSync(
  messageId: string,
  localPreviewUri?: string | null,
  remoteUrl?: string | null,
): string | null {
  const cached = getCachedMediaUriSync(messageId)
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
  )
  if (sync && !sync.startsWith('http')) return sync

  const cached = await getCachedMediaUri(message.id)
  if (cached) return cached

  return resolvePlaybackUri(message, remoteUrl)
}
