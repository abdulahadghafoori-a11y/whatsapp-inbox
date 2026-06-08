import { useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { flushOutboundQueue, hydrateOutboundQueue } from '@/lib/offlineQueue'
import { flushMediaQueue, hydrateOfflineMediaQueue } from '@/lib/offlineMediaQueue'
import { initNetworkListener } from '@/lib/network'
import { captureError } from '@/lib/errorReporting'
import { ensureDbReady } from '@/lib/db/client'
import { scheduleSync } from '@/lib/sync/syncEngine'

/** Restores + flushes queued sends (into the device DB) when back online. */
export function OfflineSyncBridge() {
  useEffect(() => {
    initNetworkListener()

    async function sync() {
      try {
        await ensureDbReady()
        await hydrateOfflineMediaQueue()
        await hydrateOutboundQueue()
        const text = await flushOutboundQueue()
        const media = await flushMediaQueue()
        if (text.sent > 0 || media.sent > 0) scheduleSync()
      } catch (err) {
        // storage unavailable / flush race — surface so silent send loss is visible.
        captureError(err, { scope: 'OfflineSyncBridge.sync' })
      }
    }

    void sync()

    const unsubNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void sync()
    })

    const unsubApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync()
    })

    return () => {
      unsubNet()
      unsubApp.remove()
    }
  }, [])

  return null
}
