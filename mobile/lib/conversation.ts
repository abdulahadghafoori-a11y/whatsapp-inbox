import type { ConversationDetail, ConversationListItem } from '@/types'

/** Backfill CTWA / window flags when API or socket payloads omit new fields. */
export function normalizeConversation<T extends ConversationListItem>(c: T): T {
  const isWindowOpen = c.isWindowOpen ?? Boolean(c.windowExpiresAt && hoursLeft(c.windowExpiresAt) > 0)
  const isFepOpen =
    c.isFepOpen ?? Boolean(c.fepExpiresAt && hoursLeft(c.fepExpiresAt) > 0)
  const ctwaClid = (c as ConversationListItem & { ctwaClid?: string | null }).ctwaClid
  const isCtwaLead = c.isCtwaLead ?? Boolean(c.ctwaStartedAt ?? ctwaClid)
  const canSendSession = c.canSendSession ?? isWindowOpen

  return {
    ...c,
    fepExpiresAt: c.fepExpiresAt ?? null,
    ctwaStartedAt: c.ctwaStartedAt ?? null,
    isWindowOpen,
    isFepOpen,
    isCtwaLead,
    canSendSession,
    canSendTemplate: c.canSendTemplate ?? true,
    needsTemplateForReply: c.needsTemplateForReply ?? !canSendSession,
  }
}

function hoursLeft(iso: string): number {
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 0
  return (ms - Date.now()) / (1000 * 60 * 60)
}
