import { InteractionManager } from 'react-native'
import { api } from '@/services/api'
import { mediaApiPath } from '@/lib/mediaApi'
import { isOnline } from '@/lib/network'
import { isAutoDownloadAllowed } from '@/lib/mediaAutoDownload'
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
import { isHeavyMediaType, isStickerType } from '@/lib/messageMediaKind'
import type { Message, MessageType } from '@/types'

export type SyncableMediaMessage = {
  id: string
  conversationId: string
  type: MessageType
  direction?: Message['direction']
  mediaUrl: string | null
  mediaStatus: Message['mediaStatus']
  localPreviewUri?: string | null
  mediaMimeType: string | null
  mediaFilename: string | null
}

const inflight = new Map<string, Promise<string | null>>()
const queuedIds = new Set<string>()
const syncQueue: SyncableMediaMessage[] = []
const downloadingIds = new Set<string>()
const downloadListeners = new Map<string, Set<() => void>>()
let activeSyncs = 0
const MAX_CONCURRENT_SYNCS = 2

function inflightKey(message: SyncableMediaMessage) {
  return message.mediaUrl ?? `msg:${message.id}`
}

function notifyDownload(messageId: string) {
  downloadListeners.get(messageId)?.forEach((cb) => cb())
}

export function isMessageMediaDownloading(messageId: string | undefined): boolean {
  if (!messageId) return false
  return downloadingIds.has(messageId)
}

export function subscribeMessageMediaDownload(
  messageId: string | undefined,
  cb: () => void,
): () => void {
  if (!messageId) return () => undefined
  let set = downloadListeners.get(messageId)
  if (!set) {
    set = new Set()
    downloadListeners.set(messageId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) downloadListeners.delete(messageId)
  }
}

function setDownloading(messageId: string, on: boolean) {
  if (on) downloadingIds.add(messageId)
  else downloadingIds.delete(messageId)
  notifyDownload(messageId)
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
  if (!(await isAutoDownloadAllowed(message))) return null

  await ensureMediaIndexLoaded()
  if (isAlreadyCachedSync(message)) return getCachedMediaUriSync(message.id)

  setDownloading(message.id, true)
  try {
    return await syncMessageMediaInner(message)
  } finally {
    setDownloading(message.id, false)
  }
}

/**
 * Queue on-device cache download (max 2 concurrent). Skips if already cached or queued.
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
  if (!opts?.force && !(await isAutoDownloadAllowed(message))) return null

  await ensureMediaIndexLoaded()

  const sync = getCachedMediaUriSync(message.id)
  if (sync) return sync

  const key = inflightKey(message)
  const pending = inflight.get(key)
  if (pending) return pending

  setDownloading(message.id, true)
  const promise = syncMessageMediaInner(message).finally(() => {
    inflight.delete(key)
    setDownloading(message.id, false)
  })
  inflight.set(key, promise)
  return promise
}

/** Visible viewport order (WhatsApp-style) — no type-based priority. */
export function syncVisibleMessageMedia(messages: SyncableMediaMessage[]) {
  const seen = new Set<string>()
  for (const message of messages) {
    if (seen.has(message.id)) continue
    if (!isCacheableMedia(message)) continue
    if (!isHeavyMediaType(message.type) && !isStickerType(message.type)) continue
    seen.add(message.id)
    queueMessageMediaSync(message)
  }
}

/** Small prefetch window around visible rows only. */
export function syncConversationMedia(
  messages: SyncableMediaMessage[],
  opts?: { maxItems?: number },
) {
  const maxItems = opts?.maxItems ?? 6
  const cacheable = messages.filter(isCacheableMedia).slice(0, maxItems)

  const task = InteractionManager.runAfterInteractions(() => {
    syncVisibleMessageMedia(cacheable)
  })
  return () => task.cancel()
}
