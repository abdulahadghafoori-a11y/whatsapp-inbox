import type { ConversationListItem } from '@/types'

/** Uniform inbox row height (avatar 52 + vertical padding 24). */
export const INBOX_ROW_HEIGHT = 76

export function conversationInboxEqual(
  a: ConversationListItem,
  b: ConversationListItem,
): boolean {
  return (
    a.id === b.id &&
    a.unreadCount === b.unreadCount &&
    a.pinnedAt === b.pinnedAt &&
    a.lastMessageAt === b.lastMessageAt &&
    a.lastMessagePreview === b.lastMessagePreview &&
    a.lastMessageDirection === b.lastMessageDirection &&
    a.lastMessageStatus === b.lastMessageStatus &&
    a.lastMessageType === b.lastMessageType &&
    a.contact?.name === b.contact?.name &&
    a.contact?.waId === b.contact?.waId &&
    a.isCtwaLead === b.isCtwaLead &&
    a.aiHandled === b.aiHandled &&
    a.assignedAgent?.name === b.assignedAgent?.name
  )
}

/** Keep stable row object refs when inbox-visible fields are unchanged (FlashList perf). */
export function stabilizeConversationList(
  prev: ConversationListItem[],
  next: ConversationListItem[],
): ConversationListItem[] {
  if (prev === next) return prev
  if (prev.length !== next.length) return next
  let stable = true
  const merged: ConversationListItem[] = new Array(next.length)
  for (let i = 0; i < next.length; i++) {
    const old = prev[i]
    const row = next[i]
    if (old && old.id === row.id && conversationInboxEqual(old, row)) {
      merged[i] = old
    } else {
      merged[i] = row
      stable = false
    }
  }
  return stable ? prev : merged
}
