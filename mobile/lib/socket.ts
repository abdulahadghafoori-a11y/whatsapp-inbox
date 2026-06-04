import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket
  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    auth: { token: useAuthStore.getState().accessToken },
  })
  return socket
}

export function connectSocket() {
  const s = getSocket()
  s.auth = { token: useAuthStore.getState().accessToken }
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
  socket?.disconnect()
}
