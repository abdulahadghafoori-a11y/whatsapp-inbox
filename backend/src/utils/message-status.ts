export type StoredMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'played'
  | 'failed'

const RANK: Record<StoredMessageStatus, number> = {
  failed: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
}

/** Map WhatsApp webhook status strings to stored message status. */
export function normalizeWaMessageStatus(raw: string): StoredMessageStatus | null {
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

export function shouldUpgradeStatus(
  current: string,
  incoming: StoredMessageStatus,
): boolean {
  const cur = current as StoredMessageStatus
  if (incoming === 'failed') return true
  if (cur === 'failed') return false
  const curRank = RANK[cur] ?? 0
  return RANK[incoming] > curRank
}
