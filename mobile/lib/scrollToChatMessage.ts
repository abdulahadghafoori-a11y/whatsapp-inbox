import type { RefObject } from 'react'
import type { FlatList } from 'react-native-gesture-handler'
import type { ChatListItem } from '@/lib/chatListItems'

export function findMessageListIndex(items: ChatListItem[], messageId: string): number {
  return items.findIndex((row) => row.kind === 'message' && row.message.id === messageId)
}

export function scrollToChatMessage(
  listRef: RefObject<FlatList<ChatListItem> | null>,
  items: ChatListItem[],
  messageId: string,
  onHighlight: (id: string | null) => void,
  highlightMs = 2200,
): boolean {
  const index = findMessageListIndex(items, messageId)
  if (index < 0) return false
  listRef.current?.scrollToIndex({
    index,
    animated: true,
    viewPosition: 0.5,
  })
  onHighlight(messageId)
  if (highlightMs > 0) {
    setTimeout(() => onHighlight(null), highlightMs)
  }
  return true
}

export function conversationHref(conversationId: string, messageId?: string): string {
  if (!messageId) return `/conversation/${conversationId}`
  return `/conversation/${conversationId}?messageId=${encodeURIComponent(messageId)}`
}
