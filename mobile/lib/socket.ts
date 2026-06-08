import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'
import { assertProductionTransportSecurity } from '@/lib/transportSecurity'

assertProductionTransportSecurity()

export const SOCKET_BASE_URL = (
  process.env.EXPO_PUBLIC_SOCKET_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3001'
).replace(/\/$/, '')

let socket: Socket | null = null
let connectErrorRecovering = false

async function onConnectError(err: Error) {
  if (err.message === 'TOKEN_REVOKED') {
    const { isSessionClearing } = await import('@/stores/authStore')
    if (!isSessionClearing()) await useAuthStore.getState().clear()
    disconnectSocket()
    return
  }
  if (err.message !== 'Unauthorized' || connectErrorRecovering) return
  connectErrorRecovering = true
  try {
    const { refreshAccessTokenSingleFlight } = await import('@/services/api')
    const token = await refreshAccessTokenSingleFlight()
    if (token && socket) {
      socket.auth = { token }
      socket.connect()
    } else {
      // Refresh failed (session cleared) — stop the infinite reconnect loop with a
      // dead JWT, otherwise the banner stays on "Reconnecting…" forever.
      disconnectSocket()
    }
  } finally {
    connectErrorRecovering = false
  }
}

function createSocket(): Socket {
  const s = io(SOCKET_BASE_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    auth: { token: useAuthStore.getState().accessToken },
  })
  s.on('connect_error', onConnectError)
  return s
}

export function getSocket(): Socket {
  if (!socket) socket = createSocket()
  return socket
}

export function connectSocket() {
  const token = useAuthStore.getState().accessToken
  if (!token) return getSocket()
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

/** Re-authenticate the socket after an access-token refresh. */
export function reauthSocket() {
  if (!socket) return
  socket.auth = { token: useAuthStore.getState().accessToken }
  if (socket.connected) {
    socket.disconnect()
    socket.connect()
  }
}

export function disconnectSocket() {
  if (!socket) return
  socket.off('connect_error', onConnectError)
  socket.disconnect()
  socket = null
}
