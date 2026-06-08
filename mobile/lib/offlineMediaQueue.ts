import * as FileSystem from 'expo-file-system/legacy'
import { appStorage } from '@/lib/appStorage'
import { resolveUploadUri } from '@/lib/uploadUri'
import { postMediaMessage } from '@/lib/postMediaMessage'
import { deleteMessages, patchLocalMessage, putLocalMessage } from '@/lib/db/repo'
import { scheduleSync } from '@/lib/sync/syncEngine'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import type { Message } from '@/types'

const KEY = 'wa-inbox-media-queue'
const QUEUE_DIR = `${FileSystem.cacheDirectory}offline-media-queue/`

export type PendingMediaSend = {
  id: string
  conversationId: string
  queueUri: string
  name: string
  mimeType: string
  caption?: string
  replyToMessageId?: string
  imageQuality?: MediaQualityTier
  videoQuality?: MediaQualityTier
  videoTrim?: { startMs: number; endMs: number }
  sendAsDocument?: boolean
  createdAt: string
}

async function ensureQueueDir() {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true })
  }
}

export async function loadMediaQueue(): Promise<PendingMediaSend[]> {
  const raw = await appStorage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PendingMediaSend[]
  } catch {
    return []
  }
}

async function saveMediaQueue(items: PendingMediaSend[]) {
  await appStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueueMediaSend(
  input: Omit<PendingMediaSend, 'id' | 'queueUri' | 'createdAt'> & {
    sourceUri: string
    /** Must match optimistic bubble id (clientMessageId). */
    id?: string
  },
): Promise<PendingMediaSend> {
  await ensureQueueDir()
  const id =
    input.id ?? `pending-media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const ext = input.name.includes('.') ? input.name.slice(input.name.lastIndexOf('.')) : '.bin'
  const queueUri = `${QUEUE_DIR}${id}${ext}`
  await FileSystem.copyAsync({
    from: resolveUploadUri(input.sourceUri),
    to: queueUri,
  })
  const item: PendingMediaSend = {
    id,
    conversationId: input.conversationId,
    queueUri,
    name: input.name,
    mimeType: input.mimeType,
    caption: input.caption,
    replyToMessageId: input.replyToMessageId,
    imageQuality: input.imageQuality,
    videoQuality: input.videoQuality,
    videoTrim: input.videoTrim,
    sendAsDocument: input.sendAsDocument,
    createdAt: new Date().toISOString(),
  }
  const queue = await loadMediaQueue()
  queue.push(item)
  await saveMediaQueue(queue)
  return item
}

export async function clearMediaQueue(): Promise<void> {
  await appStorage.removeItem(KEY)
  try {
    await FileSystem.deleteAsync(QUEUE_DIR, { idempotent: true })
  } catch {
    /* ignore */
  }
}

let flushMediaInFlight: Promise<{ sent: number; failed: number }> | null = null

export function flushMediaQueue(): Promise<{ sent: number; failed: number }> {
  if (flushMediaInFlight) return flushMediaInFlight
  flushMediaInFlight = doFlushMediaQueue().finally(() => {
    flushMediaInFlight = null
  })
  return flushMediaInFlight
}

async function doFlushMediaQueue(): Promise<{ sent: number; failed: number }> {
  const queue = await loadMediaQueue()
  if (queue.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const remaining: PendingMediaSend[] = []

  for (const item of queue) {
    try {
      await patchLocalMessage(item.id, { sendPhase: 'uploading' })
      await postMediaMessage(item.conversationId, {
        uri: item.queueUri,
        name: item.name,
        mimeType: item.mimeType,
        caption: item.caption,
        replyToMessageId: item.replyToMessageId,
        imageQuality: item.imageQuality,
        videoQuality: item.videoQuality,
        videoTrim: item.videoTrim,
        sendAsDocument: item.sendAsDocument,
        onPhase: (phase) => {
          void patchLocalMessage(item.id, { sendPhase: phase })
        },
      })
      sent++
      await deleteMessages([item.id])
      try {
        await FileSystem.deleteAsync(item.queueUri, { idempotent: true })
      } catch {
        /* ignore */
      }
    } catch (err) {
      failed++
      remaining.push(item)
      await patchLocalMessage(item.id, {
        status: 'failed',
        sendPhase: undefined,
        errorMessage:
          err instanceof Error ? err.message : 'Upload failed. Tap to retry.',
      })
    }
  }

  await saveMediaQueue(remaining)
  if (sent > 0) scheduleSync()
  return { sent, failed }
}

/** Restore queued outbound bubbles (into the device DB) after app restart. */
export async function hydrateOfflineMediaQueue(): Promise<void> {
  const queue = await loadMediaQueue()
  for (const item of queue) {
    await putLocalMessage(buildQueuedMediaMessage(item.conversationId, item, item.queueUri))
  }
}

export function buildQueuedMediaMessage(
  conversationId: string,
  item: PendingMediaSend,
  localUri: string,
): Message {
  return {
    id: item.id,
    conversationId,
    waMessageId: null,
    sentBy: null,
    direction: 'outbound',
    type: item.mimeType.startsWith('video/')
      ? 'video'
      : item.mimeType.startsWith('audio/')
        ? 'audio'
        : item.mimeType === 'image/webp'
          ? 'sticker'
          : item.mimeType.startsWith('image/')
            ? 'image'
            : 'document',
    body: item.caption ?? null,
    mediaUrl: null,
    mediaMimeType: item.mimeType,
    mediaFilename: item.name,
    mediaStatus: 'uploaded',
    status: 'pending',
    errorMessage: null,
    replyToMessageId: item.replyToMessageId ?? null,
    replyTo: null,
    sentAt: item.createdAt,
    createdAt: item.createdAt,
    localPreviewUri: localUri,
    sendPhase: 'queued',
  }
}
