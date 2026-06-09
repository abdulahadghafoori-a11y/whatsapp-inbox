import type { RefObject } from 'react'
import type { FlatList } from 'react-native-gesture-handler'
import type { ChatListItem } from '@/lib/chatListItems'
import { chatListOffsetToIndex } from '@/lib/chatListRef'

const MAX_SCROLL_INDEX_RETRIES = 1
const SCROLL_RETRY_DELAY_MS = 0

export function findMessageListIndex(items: ChatListItem[], messageId: string): number {
  return items.findIndex((row) => row.kind === 'message' && row.message.id === messageId)
}

export type ScrollToIndexRetryOptions = {
  animated?: boolean
  viewPosition?: number
  maxRetries?: number
  delayMs?: number
  /** Used for pixel-offset fallback when scrollToIndex fails. */
  items?: ChatListItem[]
}

/** Retry scrollToIndex after layout settles (Stream MessageList pattern). */
export function scrollToChatIndexWithRetry(
  listRef: RefObject<FlatList<ChatListItem> | null>,
  index: number,
  opts: ScrollToIndexRetryOptions = {},
): void {
  const {
    animated = true,
    viewPosition = 0.5,
    maxRetries = MAX_SCROLL_INDEX_RETRIES,
    delayMs = SCROLL_RETRY_DELAY_MS,
    items,
  } = opts

  let attempts = 0

  const tryScroll = () => {
    if (!listRef.current) return
    try {
      listRef.current.scrollToIndex({ index, animated, viewPosition })
    } catch {
      if (items?.length) {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, chatListOffsetToIndex(items, index)),
          animated,
        })
        return
      }
      if (attempts >= maxRetries) return
      attempts += 1
      setTimeout(tryScroll, delayMs)
    }
  }

  setTimeout(tryScroll, delayMs)
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
  scrollToChatIndexWithRetry(listRef, index, {
    animated: true,
    viewPosition: 0.5,
    maxRetries: 1,
    items,
  })
  onHighlight(messageId)
  if (highlightMs > 0) {
    setTimeout(() => onHighlight(null), highlightMs)
  }
  return true
}

/** Load older pages until a message row exists or history is exhausted. */
export async function paginateUntilMessageVisible(opts: {
  messageId: string
  getItems: () => ChatListItem[]
  hasOlder: () => boolean
  fetchOlder: () => Promise<unknown>
  maxAttempts?: number
  waitMs?: number
}): Promise<boolean> {
  const maxAttempts = opts.maxAttempts ?? 40
  const waitMs = opts.waitMs ?? 50

  if (findMessageListIndex(opts.getItems(), opts.messageId) >= 0) return true

  let attempts = 0
  while (opts.hasOlder() && attempts < maxAttempts) {
    attempts += 1
    await opts.fetchOlder()
    await new Promise((r) => setTimeout(r, waitMs))
    if (findMessageListIndex(opts.getItems(), opts.messageId) >= 0) return true
  }
  return findMessageListIndex(opts.getItems(), opts.messageId) >= 0
}

export function conversationHref(conversationId: string, messageId?: string): string {
  if (!messageId) return `/conversation/${conversationId}`
  return `/conversation/${conversationId}?messageId=${encodeURIComponent(messageId)}`
}
