import { useSocketSync } from '@/hooks/useSocket'

/** Connects socket + cache sync only while the user is logged in. */
export function SocketBridge() {
  useSocketSync()
  return null
}
