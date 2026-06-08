import { QueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { isOnWifi } from '@/lib/network'
import {
  getMediaDownloadPrefs,
  messageTypeToDownloadKind,
  policyAllowsDownload,
} from '@/lib/mediaDownloadPrefs'
import { isStickerType } from '@/lib/messageMediaKind'
import type { Message, MessageType } from '@/types'

type PresignItem = { key: string; messageId: string }

export type PresignCandidate = {
  key: string | null | undefined
  messageId: string
  type: MessageType
  direction?: Message['direction']
}

const pending = new Map<string, PresignItem>()
/** Callers awaiting a specific (key,messageId) presign so we make one network call. */
const waiters = new Map<string, { resolve: (url: string) => void; reject: (e: unknown) => void }[]>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null

const BATCH_DELAY_MS = 80
const MAX_BATCH = 20

function itemKey(item: PresignItem) {
  return `${item.key}\0${item.messageId}`
}

function resolveWaiters(key: string, url: string) {
  const list = waiters.get(key)
  if (!list) return
  waiters.delete(key)
  for (const w of list) w.resolve(url)
}

function rejectWaiters(key: string, err: unknown) {
  const list = waiters.get(key)
  if (!list) return
  waiters.delete(key)
  for (const w of list) w.reject(err)
}

function scheduleFlush(qc: QueryClient) {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush(qc)
  }, BATCH_DELAY_MS)
}

async function flush(qc: QueryClient) {
  if (inflight) {
    await inflight
    if (pending.size > 0) scheduleFlush(qc)
    return
  }

  const batch = [...pending.values()].slice(0, MAX_BATCH)
  for (const item of batch) pending.delete(itemKey(item))
  if (batch.length === 0) return

  inflight = (async () => {
    try {
      const res = await api.post<{
        urls: Array<{ key: string; messageId: string; url: string; expiresAt: string }>
      }>('/media/batch', { items: batch })

      const returned = new Set<string>()
      for (const row of res.data.urls) {
        qc.setQueryData(['media', row.key, row.messageId], row.url)
        const k = itemKey({ key: row.key, messageId: row.messageId })
        returned.add(k)
        resolveWaiters(k, row.url)
      }
      // Reject any awaited items the server omitted so their queries don't hang.
      for (const item of batch) {
        const k = itemKey(item)
        if (!returned.has(k)) rejectWaiters(k, new Error('No presigned URL returned'))
      }
    } catch (err) {
      for (const item of batch) {
        const k = itemKey(item)
        if (!qc.getQueryData(['media', item.key, item.messageId])) {
          // Re-queue only if someone still awaits or it may be retried by viewport.
          if (waiters.has(k)) rejectWaiters(k, err)
          else pending.set(k, item)
        }
      }
      scheduleFlush(qc)
    }
  })().finally(() => {
    inflight = null
  })

  await inflight
  if (pending.size > 0) scheduleFlush(qc)
}

export function queueMediaPresign(
  qc: QueryClient,
  key: string | null | undefined,
  messageId: string | null | undefined,
  opts?: { force?: boolean },
) {
  if (!key || !messageId) return
  if (!opts?.force && qc.getQueryData(['media', key, messageId])) return

  pending.set(itemKey({ key, messageId }), { key, messageId })
  scheduleFlush(qc)
}

/**
 * Resolve a single presign through the shared batch so the hook path and the
 * viewport prefetch path make exactly one network request per (key,messageId).
 */
export function presignViaBatch(
  qc: QueryClient,
  key: string,
  messageId: string,
): Promise<string> {
  const cached = qc.getQueryData<string>(['media', key, messageId])
  if (cached) return Promise.resolve(cached)
  return new Promise<string>((resolve, reject) => {
    const k = itemKey({ key, messageId })
    const list = waiters.get(k) ?? []
    list.push({ resolve, reject })
    waiters.set(k, list)
    pending.set(k, { key, messageId })
    scheduleFlush(qc)
  })
}

/** Respect Storage & data — no presign on cellular when Wi‑Fi-only is set. */
export async function queueMediaPresignForMessages(
  qc: QueryClient,
  items: PresignCandidate[],
  opts?: { force?: boolean },
) {
  if (!items.length) return

  const prefs = await getMediaDownloadPrefs()
  const onWifi = await isOnWifi()

  for (const item of items) {
    if (!item.key) continue
    if (isStickerType(item.type)) {
      queueMediaPresign(qc, item.key, item.messageId)
      continue
    }
    if (item.direction === 'outbound') {
      queueMediaPresign(qc, item.key, item.messageId, opts)
      continue
    }
    if (opts?.force) {
      queueMediaPresign(qc, item.key, item.messageId, { force: true })
      continue
    }
    const kind = messageTypeToDownloadKind(item.type)
    if (!kind) {
      queueMediaPresign(qc, item.key, item.messageId)
      continue
    }
    if (policyAllowsDownload(prefs[kind], onWifi)) {
      queueMediaPresign(qc, item.key, item.messageId)
    }
  }
}

/** @deprecated Use queueMediaPresignForMessages */
export const queueMediaPresignMany = queueMediaPresignForMessages
