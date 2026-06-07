import { InteractionManager } from 'react-native'
import { api } from '@/services/api'
import { mediaApiPath } from '@/lib/mediaApi'
import { isOnline, isOnWifi } from '@/lib/network'
import {
  getMediaDownloadPrefs,
  messageTypeToDownloadKind,
} from '@/lib/mediaDownloadPrefs'
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
const queuedIds = new Set<string>()
const syncQueue: SyncableMediaMessage[] = []
let activeSyncs = 0
const MAX_CONCURRENT_SYNCS = 2

function inflightKey(message: SyncableMediaMessage) {
  return message.mediaUrl ?? `msg:${message.id}`
}

function isCacheableMedia(message: SyncableMediaMessage): boolean {
  if (message.type === 'text' || message.type === 'location') return false
  if (message.mediaStatus === 'pending') return false
  return true
}

function isAlreadyCachedSync(message: SyncableMediaMessage): boolean {
  if (getCachedMediaUriSync(message.id)) return true
  if (message.mediaUrl && getCachedUriForS3KeySync(message.mediaUrl)) return true
  return false
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

async function autoDownloadAllowed(message: SyncableMediaMessage): Promise<boolean> {
  const kind = messageTypeToDownloadKind(message.type)
  if (!kind) return true
  const prefs = await getMediaDownloadPrefs()
  const policy = prefs[kind]
  if (policy === 'never') return false
  if (policy === 'wifi' && !(await isOnWifi())) return false
  return true
}

function drainSyncQueue() {
  while (activeSyncs < MAX_CONCURRENT_SYNCS && syncQueue.length > 0) {
    const message = syncQueue.shift()!
    queuedIds.delete(message.id)

    const key = inflightKey(message)
    const pending = inflight.get(key)
    if (pending) {
      void pending.finally(() => drainSyncQueue())
      continue
    }

    activeSyncs++
    const promise = runSyncJob(message).finally(() => {
      activeSyncs--
      drainSyncQueue()
    })
    inflight.set(key, promise)
    void promise.finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  }
}

async function runSyncJob(message: SyncableMediaMessage): Promise<string | null> {
  if (!isCacheableMedia(message)) return null
  if (!(await autoDownloadAllowed(message))) return null

  await ensureMediaIndexLoaded()
  if (isAlreadyCachedSync(message)) return getCachedMediaUriSync(message.id)

  return syncMessageMediaInner(message)
}

/**
 * Queue on-device cache download (max 2 concurrent). Skips if already cached or queued.
 * UI can show presigned URLs while cache fills in the background.
 */
export function queueMessageMediaSync(
  message: SyncableMediaMessage,
  opts?: { force?: boolean },
): void {
  if (!isCacheableMedia(message)) return
  if (!opts?.force && queuedIds.has(message.id)) return

  void ensureMediaIndexLoaded().then(() => {
    if (!opts?.force && isAlreadyCachedSync(message)) return
    if (queuedIds.has(message.id)) return
    queuedIds.add(message.id)
    syncQueue.push(message)
    drainSyncQueue()
  })
}

export async function syncMessageMedia(
  message: SyncableMediaMessage,
  opts?: { force?: boolean },
): Promise<string | null> {
  if (!isCacheableMedia(message)) return null
  if (!opts?.force && !(await autoDownloadAllowed(message))) return null

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

export function syncVisibleMessageMedia(messages: SyncableMediaMessage[]) {
  for (const message of messages) {
    queueMessageMediaSync(message)
  }
}

/** Background cache for one conversation — capped and staggered so opening a chat stays smooth. */
export function syncConversationMedia(
  messages: SyncableMediaMessage[],
  opts?: { maxItems?: number },
) {
  const maxItems = opts?.maxItems ?? 24
  const cacheable = messages.filter(isCacheableMedia)
  const priority = cacheable.filter((m) => m.type === 'audio' || m.type === 'video')
  const rest = cacheable.filter((m) => m.type !== 'audio' && m.type !== 'video')
  const ordered = [...priority, ...rest].slice(0, maxItems)

  const task = InteractionManager.runAfterInteractions(() => {
    for (const message of ordered) {
      queueMessageMediaSync(message)
    }
  })
  return () => task.cancel()
}
