import { useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useQueryClient } from '@tanstack/react-query'
import { flushOutboundQueue } from '@/lib/offlineQueue'
import { initNetworkListener } from '@/lib/network'

/** Flushes queued sends when the device is back online. */
export function OfflineSyncBridge() {
  const qc = useQueryClient()

  useEffect(() => {
    initNetworkListener()

    async function sync() {
      try {
        const { sent } = await flushOutboundQueue()
        if (sent > 0) {
          await qc.invalidateQueries({ queryKey: ['messages'] })
          await qc.invalidateQueries({ queryKey: ['conversations'] })
        }
      } catch {
        // storage unavailable
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
  }, [qc])

  return null
}
