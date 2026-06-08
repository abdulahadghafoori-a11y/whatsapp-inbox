import type { Socket } from 'socket.io-client'
import { api } from '@/services/api'
import { captureError } from '@/lib/errorReporting'
import { ensureDbReady } from '@/lib/db/client'
import { getSyncValue, setSyncValue } from '@/lib/db/repo'
import { applyChanges } from './applyChanges'
import { SYNC_CURSOR_KEY, type SyncResponse } from './types'

const PAGE_LIMIT = 500
/** Socket events that mean "server state changed" → pull the delta. */
const PULL_SIGNALS = [
  'new_message',
  'message_updated',
  'message_status',
  'message_deleted',
  'media_ready',
  'media_failed',
  'media_thumbhash',
  'conversation_updated',
  'conversation_assigned',
  'inbox_updated',
]

let pulling = false
let queued = false
let boundSocket: Socket | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const boundHandlers = new Map<string, () => void>()

async function getCursor(): Promise<number> {
  const raw = await getSyncValue(SYNC_CURSOR_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

/** Drain the change feed from the stored cursor until fully caught up. */
async function pullUntilCaughtUp(): Promise<void> {
  await ensureDbReady()
  let since = await getCursor()

  for (;;) {
    const { data } = await api.get<SyncResponse>('/sync', {
      params: { since, limit: PAGE_LIMIT },
    })
    if (data.changes.length > 0) await applyChanges(data.changes)
    if (data.cursor > since) {
      await setSyncValue(SYNC_CURSOR_KEY, String(data.cursor))
      since = data.cursor
    }
    if (!data.hasMore) break
  }
}

/**
 * Pull now, coalescing concurrent requests: a call during an in-flight pull
 * schedules exactly one more pass so we never miss a late signal nor stampede.
 */
export async function syncNow(): Promise<void> {
  if (pulling) {
    queued = true
    return
  }
  pulling = true
  try {
    do {
      queued = false
      await pullUntilCaughtUp()
    } while (queued)
  } catch (err) {
    if (__DEV__) console.warn('[sync] pull failed', err)
    // Cursor is intentionally left unadvanced on failure so the next pull retries
    // the same delta; report so silent staleness is observable in production.
    captureError(err, { scope: 'sync.pull' })
  } finally {
    pulling = false
  }
}

export function scheduleSync(delayMs = 150): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncNow()
  }, delayMs)
}

/**
 * Fast-forward a fresh device past historical data that has no change-feed
 * entries (the feed only records mutations after migration 0011). Screens seed
 * their initial snapshot from REST; the cursor then tracks deltas only.
 */
export async function fastForwardCursorToHead(): Promise<void> {
  await ensureDbReady()
  const existing = await getSyncValue(SYNC_CURSOR_KEY)
  if (existing) return
  const { data } = await api.get<{ cursor: number }>('/sync/head')
  await setSyncValue(SYNC_CURSOR_KEY, String(data.cursor ?? 0))
}

/** Bind socket signals so any server change triggers a debounced pull. */
export function bindSyncToSocket(socket: Socket): void {
  if (boundSocket === socket) return
  unbindSync()
  boundSocket = socket
  for (const event of PULL_SIGNALS) {
    const handler = () => scheduleSync()
    boundHandlers.set(event, handler)
    socket.on(event, handler)
  }
  // Catch up on (re)connect — covers anything missed while offline.
  const onConnect = () => scheduleSync(0)
  boundHandlers.set('connect', onConnect)
  socket.on('connect', onConnect)
}

export function unbindSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (boundSocket) {
    // Remove only our own handlers so other socket consumers are untouched.
    for (const [event, handler] of boundHandlers) boundSocket.off(event, handler)
    boundSocket = null
  }
  boundHandlers.clear()
}
