import { resolveCachedMediaUriSync } from '@/lib/messageMediaCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { Message } from '@/types'

type LocalMediaMessage = Pick<
  Message,
  'id' | 'mediaUrl' | 'localPreviewUri' | 'localCacheUri'
>

/**
 * Synchronous best local URI: optimistic preview → legacy SQLite path → disk index.
 * On-device blobs are indexed in messageMediaCache (not written back to SQLite).
 */
export function resolveMessageLocalMediaUri(message: LocalMediaMessage): string | null {
  if (message.localPreviewUri) return resolveUploadUri(message.localPreviewUri)
  if (message.localCacheUri) return resolveUploadUri(message.localCacheUri)
  return resolveCachedMediaUriSync(message.id, message.mediaUrl)
}
