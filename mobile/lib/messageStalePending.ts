import type { MessageType } from '@/types'

/** When outbound status stays pending longer than this, show retry (media needs more time). */
export function stalePendingThresholdMs(type: MessageType): number {
  if (type === 'video') return 5 * 60_000
  if (type === 'audio' || type === 'document') return 2 * 60_000
  return 45_000
}

export function isStalePendingMessage(
  status: string,
  sentAt: string | null,
  type: MessageType,
  sendPhase?: string,
): boolean {
  if (status !== 'pending' || !sentAt) return false
  if (sendPhase === 'queued') return false
  const elapsed = Date.now() - new Date(sentAt).getTime()
  return elapsed > stalePendingThresholdMs(type)
}
