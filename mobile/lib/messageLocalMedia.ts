import { resolveCachedMediaUriSync } from '@/lib/messageMediaCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { Message } from '@/types'

type LocalMediaMessage = Pick<
  Message,
  'id' | 'mediaUrl' | 'localPreviewUri' | 'localCacheUri'
>

/**
 * Synchronous best local URI for a message: optimistic preview → SQLite path → disk index.
 * The SQLite path is available on first render after download (no async index hydration).
 */
export function resolveMessageLocalMediaUri(message: LocalMediaMessage): string | null {
  if (message.localPreviewUri) return resolveUploadUri(message.localPreviewUri)
  if (message.localCacheUri) return resolveUploadUri(message.localCacheUri)
  return resolveCachedMediaUriSync(message.id, message.mediaUrl)
}
