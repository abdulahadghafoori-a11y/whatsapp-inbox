import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/authStore'

/** Was: no UI when socket disconnected — agents see reconnect state. */
export function SocketConnectionBanner() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    if (!accessToken) return
    const socket = getSocket()
    const sync = () => setConnected(socket.connected)
    sync()
    socket.on('connect', sync)
    socket.on('disconnect', sync)
    return () => {
      socket.off('connect', sync)
      socket.off('disconnect', sync)
    }
  }, [accessToken])

  if (!accessToken || connected) return null

  return (
    <View className="bg-amber-100 px-3 py-1.5">
      <Text className="text-center text-xs text-amber-900">Reconnecting…</Text>
    </View>
  )
}
