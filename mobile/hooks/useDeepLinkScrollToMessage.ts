import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { FlatList } from 'react-native-gesture-handler'
import type { ChatListItem } from '@/lib/chatListItems'
import { findMessageListIndex, scrollToChatMessage } from '@/lib/scrollToChatMessage'

type Options = {
  messageId: string | undefined
  messagesReady: boolean
  messageCount: number
  chatListItemsRef: RefObject<ChatListItem[]>
  listRef: RefObject<FlatList<ChatListItem> | null>
  hasOlderMessages: boolean
  fetchOlderMessages: () => Promise<unknown>
  setHighlightMessageId: (id: string | null) => void
  onNotFound: () => void
}

/**
 * Scroll to a message opened via search deep-link (?messageId=).
 * Loads older pages until the target row exists or history is exhausted.
 */
export function useDeepLinkScrollToMessage({
  messageId,
  messagesReady,
  messageCount,
  chatListItemsRef,
  listRef,
  hasOlderMessages,
  fetchOlderMessages,
  setHighlightMessageId,
  onNotFound,
}: Options) {
  const consumedRef = useRef<string | null>(null)
  const hasOlderRef = useRef(hasOlderMessages)
  hasOlderRef.current = hasOlderMessages

  useEffect(() => {
    const target = messageId?.trim()
    if (!target || !messagesReady) return
    if (consumedRef.current === target) return

    let cancelled = false

    const tryScroll = () => {
      const items = chatListItemsRef.current
      if (findMessageListIndex(items, target) < 0) return false
      const ok = scrollToChatMessage(listRef, items, target, setHighlightMessageId)
      if (ok) consumedRef.current = target
      return ok
    }

    void (async () => {
      if (tryScroll()) return

      let attempts = 0
      while (hasOlderRef.current && attempts < 40 && !cancelled) {
        attempts += 1
        await fetchOlderMessages()
        await new Promise((r) => setTimeout(r, 50))
        if (tryScroll()) return
      }

      if (!cancelled && consumedRef.current !== target) {
        consumedRef.current = target
        onNotFound()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    messageId,
    messagesReady,
    messageCount,
    chatListItemsRef,
    listRef,
    fetchOlderMessages,
    setHighlightMessageId,
    onNotFound,
  ])
}
