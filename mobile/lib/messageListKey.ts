import type { Message } from '@/types'

/** Stable FlatList key — survives optimistic id → server id swap during send. */
export function messageListKey(msg: Message): string {
  const meta = msg.metadata
  if (meta && typeof meta === 'object') {
    const clientId = (meta as Record<string, unknown>).clientMessageId
    if (typeof clientId === 'string' && clientId.length > 0) return clientId
  }
  return msg.id
}
