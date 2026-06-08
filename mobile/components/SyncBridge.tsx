import { useEffect } from 'react'
import { connectSocket } from '@/lib/socket'
import { captureError } from '@/lib/errorReporting'
import { ensureDbReady } from '@/lib/db/client'
import {
  bindSyncToSocket,
  fastForwardCursorToHead,
  syncNow,
  unbindSync,
} from '@/lib/sync/syncEngine'

/**
 * Owns the local-first data pipeline while logged in:
 *  - opens the device DB + applies migrations,
 *  - seeds the initial inbox snapshot (history predates the change feed),
 *  - fast-forwards the sync cursor, then drains deltas,
 *  - binds socket signals so any server change triggers a debounced pull.
 */
export function SyncBridge() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensureDbReady()
        await fastForwardCursorToHead()
        if (cancelled) return
        const socket = connectSocket()
        bindSyncToSocket(socket)
        void syncNow()
      } catch (err) {
        // Offline / first-run race — socket reconnect + screen seeding recover.
        captureError(err, { scope: 'SyncBridge.bootstrap' })
      }
    })()
    return () => {
      cancelled = true
      unbindSync()
    }
  }, [])

  return null
}
