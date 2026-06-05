import { api } from '@/services/api'
import { mediaApiPath } from '@/lib/mediaApi'
import { isOnline } from '@/lib/network'
import {
  aliasMessageToBlob,
  cacheMediaFromLocalFile,
  cacheMediaFromRemoteUrl,
  ensureMediaIndexLoaded,
  getCachedMediaUri,
  getCachedMediaUriSync,
  getCachedUriForS3KeySync,
} from '@/lib/messageMediaCache'
import { hashMediaFile } from '@/lib/mediaContentHash'
import type { Message, MessageType } from '@/types'

export type SyncableMediaMessage = {
  id: string
  conversationId: string
  type: MessageType
  mediaUrl: string | null
  mediaStatus: Message['mediaStatus']
  localPreviewUri?: string | null
  mediaMimeType: string | null
  mediaFilename: string | null
}

const inflight = new Map<string, Promise<string | null>>()

function inflightKey(message: SyncableMediaMessage) {
  return message.mediaUrl ?? `msg:${message.id}`
}

// Was: mediaApiPath(s3Key) sent messageId=undefined -> backend 400. Pass the message id.
async function presignedUrlForKey(s3Key: string, messageId: string): Promise<string | null> {
  try {
    const res = await api.get<{ url: string }>(mediaApiPath(s3Key, messageId))
    return res.data.url
  } catch {
    return null
  }
}

function isCacheableMedia(message: SyncableMediaMessage): boolean {
  if (message.type === 'text' || message.type === 'location') return false
  if (message.mediaStatus === 'pending') return false
  return true
}

async function syncMessageMediaInner(message: SyncableMediaMessage): Promise<string | null> {
  const existing = await getCachedMediaUri(message.id)
  if (existing) return existing

  if (message.mediaUrl) {
    const shared = getCachedUriForS3KeySync(message.mediaUrl)
    if (shared) {
      return aliasMessageToBlob(message.id, message.mediaUrl)
    }
  }

  if (message.localPreviewUri) {
    const contentHash = await hashMediaFile(message.localPreviewUri)
    return cacheMediaFromLocalFile(
      message.id,
      message.conversationId,
      message.localPreviewUri,
      message.mediaMimeType ?? 'application/octet-stream',
      message.mediaFilename,
      contentHash,
    )
  }

  if (!message.mediaUrl) return null

  if (!(await isOnline())) return null

  const url = await presignedUrlForKey(message.mediaUrl, message.id)
  if (!url) return null

  return cacheMediaFromRemoteUrl(
    message.id,
    message.conversationId,
    url,
    message.mediaMimeType ?? 'application/octet-stream',
    message.mediaFilename,
    message.mediaUrl,
  )
}

export async function syncMessageMedia(message: SyncableMediaMessage): Promise<string | null> {
  if (!isCacheableMedia(message)) return null

  await ensureMediaIndexLoaded()

  const sync = getCachedMediaUriSync(message.id)
  if (sync) return sync

  const key = inflightKey(message)
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = syncMessageMediaInner(message).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

export function syncConversationMedia(messages: SyncableMediaMessage[]) {
  const cacheable = messages.filter(isCacheableMedia)
  const priority = cacheable.filter((m) => m.type === 'audio' || m.type === 'video')
  const rest = cacheable.filter((m) => m.type !== 'audio' && m.type !== 'video')

  for (const message of [...priority, ...rest]) {
    void syncMessageMedia(message)
  }
}
