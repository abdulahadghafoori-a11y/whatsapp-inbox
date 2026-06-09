import type { FlashListRef } from '@shopify/flash-list'
import type { ChatListItem } from '@/lib/chatListItems'

export type ChatMessagesListRef = FlashListRef<ChatListItem>

/** Sum of row heights up to index — scroll fallback when scrollToIndex is not ready. */
export function chatListOffsetToIndex(items: ChatListItem[], index: number): number {
  let offset = 0
  for (let i = 0; i < index; i++) {
    offset += items[i]?.layoutHeight ?? 72
  }
  return offset
}
