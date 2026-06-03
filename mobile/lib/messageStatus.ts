import type { MessageStatus } from '@/types'

const RANK: Record<MessageStatus, number> = {
  failed: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
}

export function normalizeMessageStatus(raw: string): MessageStatus | null {
  switch (raw) {
    case 'pending':
    case 'sending':
      return 'pending'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'played':
      return 'played'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

/** Prefer the furthest delivery state (never downgrade read → delivered). */
export function mergeMessageStatus(
  current: MessageStatus,
  incoming: MessageStatus,
): MessageStatus {
  if (incoming === 'failed') return 'failed'
  if (current === 'failed') return incoming
  return RANK[incoming] > RANK[current] ? incoming : current
}
