import { memo, useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { View, ActivityIndicator, InteractionManager, Platform } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { FlatList } from 'react-native-gesture-handler'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import type { ViewToken } from 'react-native'
import { SwipeableMessageBubble } from '@/components/SwipeableMessageBubble'
import { ChatDatePill } from '@/components/ChatDatePill'
import type { ChatListItem } from '@/lib/chatListItems'
import { formatDateLabel } from '@/lib/format'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { MessageAnchor } from '@/components/MessageActionsOverlay'
import { buildChatMediaViewport } from '@/lib/chatMediaViewport'
import { syncVisibleMessageMedia } from '@/lib/messageMediaSync'
import { queueMediaPresignForMessages } from '@/lib/mediaPresignBatch'
import {
  clearVisibleMessageMedia,
  setVisibleMessageIds,
} from '@/lib/visibleMessageMedia'
import type { Message } from '@/types'

type ChatListRowProps = {
  item: ChatListItem
  highlightMessageId: string | null
  contactName: string
  contactAvatarUrl?: string | null
  onReply: (m: Message) => void
  onReplyQuotePress: (messageId: string) => void
  onSwipeOpen: (messageId: string, ref: Swipeable | null) => void
  onRetry: (m: Message) => void
  onLongPress: (m: Message, anchor: MessageAnchor) => void
}

function ChatListRowBase({
  item,
  highlightMessageId,
  contactName,
  contactAvatarUrl,
  onReply,
  onReplyQuotePress,
  onSwipeOpen,
  onRetry,
  onLongPress,
}: ChatListRowProps) {
  if (item.kind === 'date') {
    return <ChatDatePill label={item.label} />
  }
  const msg = item.message
  return (
    <SwipeableMessageBubble
      message={msg}
      contactName={contactName}
      contactAvatarUrl={contactAvatarUrl}
      onReply={onReply}
      onReplyQuotePress={onReplyQuotePress}
      highlight={highlightMessageId === msg.id}
      onSwipeOpen={onSwipeOpen}
      onRetry={onRetry}
      onLongPress={onLongPress}
    />
  )
}

function chatListRowEqual(prev: ChatListRowProps, next: ChatListRowProps): boolean {
  if (prev.item !== next.item) {
    if (prev.item.kind !== next.item.kind || prev.item.id !== next.item.id) return false
    if (
      prev.item.kind === 'date' &&
      next.item.kind === 'date' &&
      prev.item.label !== next.item.label
    ) {
      return false
    }
    if (
      prev.item.kind === 'message' &&
      next.item.kind === 'message' &&
      !messageRenderEqual(prev.item.message, next.item.message)
    ) {
      return false
    }
  }
  if (prev.item.kind === 'message') {
    const id = prev.item.message.id
    if (
      prev.highlightMessageId !== next.highlightMessageId &&
      (prev.highlightMessageId === id || next.highlightMessageId === id)
    ) {
      return false
    }
  }
  return (
    prev.contactName === next.contactName &&
    prev.contactAvatarUrl === next.contactAvatarUrl &&
    prev.onReply === next.onReply &&
    prev.onReplyQuotePress === next.onReplyQuotePress &&
    prev.onSwipeOpen === next.onSwipeOpen &&
    prev.onRetry === next.onRetry &&
    prev.onLongPress === next.onLongPress
  )
}

const ChatListRow = memo(ChatListRowBase, chatListRowEqual)

export type ChatMessagesListProps = {
  listRef: RefObject<FlatList<ChatListItem> | null>
  data: ChatListItem[]
  highlightMessageId: string | null
  contactName: string
  contactAvatarUrl?: string | null
  searchOpen: boolean
  isFetchingOlder: boolean
  hasOlderMessages: boolean
  canLoadOlderRef: MutableRefObject<boolean>
  onFetchOlder: () => void
  onDismissSearch: () => void
  onStickyDateChange: (label: string) => void
  onScrollOffset: (offsetY: number) => void
  onReply: (m: Message) => void
  onReplyQuotePress: (messageId: string) => void
  onSwipeOpen: (messageId: string, ref: Swipeable | null) => void
  onRetry: (m: Message) => void
  onLongPress: (m: Message, anchor: MessageAnchor) => void
}

function ChatMessagesListBase({
  listRef,
  data,
  highlightMessageId,
  contactName,
  contactAvatarUrl,
  searchOpen,
  isFetchingOlder,
  hasOlderMessages,
  canLoadOlderRef,
  onFetchOlder,
  onDismissSearch,
  onStickyDateChange,
  onScrollOffset,
  onReply,
  onReplyQuotePress,
  onSwipeOpen,
  onRetry,
  onLongPress,
}: ChatMessagesListProps) {
  const stickyDateRef = useRef('')
  const queryClient = useQueryClient()

  useEffect(() => () => clearVisibleMessageMedia(), [])

  const dataRef = useRef(data)
  dataRef.current = data

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let topIndex = -1
      let topDate: string | null = null

      // Defer media bookkeeping (presign batching, download sync) off the scroll
      // frame so fast flings stay at 60fps; the sticky-date update stays sync.
      InteractionManager.runAfterInteractions(() => {
        const viewport = buildChatMediaViewport(dataRef.current, viewableItems)
        setVisibleMessageIds(viewport.loadMessageIds)
        if (viewport.presignCandidates.length) {
          void queueMediaPresignForMessages(queryClient, viewport.presignCandidates)
        }
        if (viewport.orderedMedia.length) syncVisibleMessageMedia(viewport.orderedMedia)
      })

      for (const token of viewableItems) {
        const row = token.item as ChatListItem
        if (token.index == null || token.index <= topIndex) continue
        if (row.kind === 'date') {
          topIndex = token.index
          topDate = row.dateIso
        } else if (row.kind === 'message') {
          topIndex = token.index
          topDate = row.message.sentAt
        }
      }

      if (!topDate) return
      const label = formatDateLabel(topDate)
      if (label === stickyDateRef.current) return
      stickyDateRef.current = label
      onStickyDateChange(label)
    },
    [onStickyDateChange, queryClient],
  )

  const onViewableItemsChangedRef = useRef(onViewableItemsChanged)
  onViewableItemsChangedRef.current = onViewableItemsChanged
  const onViewableItemsChangedStable = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      onViewableItemsChangedRef.current(info)
    },
    [],
  )

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current
  const viewabilityPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged: onViewableItemsChangedStable },
  ]).current

  const highlightRef = useRef(highlightMessageId)
  highlightRef.current = highlightMessageId

  const renderItem = useCallback(
    ({ item }: { item: ChatListItem }) => (
      <ChatListRow
        item={item}
        highlightMessageId={highlightRef.current}
        contactName={contactName}
        contactAvatarUrl={contactAvatarUrl}
        onReply={onReply}
        onReplyQuotePress={onReplyQuotePress}
        onSwipeOpen={onSwipeOpen}
        onRetry={onRetry}
        onLongPress={onLongPress}
      />
    ),
    [
      contactAvatarUrl,
      contactName,
      onLongPress,
      onReply,
      onReplyQuotePress,
      onRetry,
      onSwipeOpen,
    ],
  )

  return (
    <FlatList
      ref={listRef}
      data={data}
      extraData={highlightMessageId}
      inverted
      initialNumToRender={8}
      maxToRenderPerBatch={4}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      // Android inverted lists with media bubbles blank out / flicker with this
      // enabled (known RN issue); keep the memory win only on iOS.
      removeClippedSubviews={Platform.OS === 'ios'}
      keyExtractor={(row) => row.id}
      viewabilityConfigCallbackPairs={viewabilityPairs}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 10,
      }}
      onScrollBeginDrag={() => {
        canLoadOlderRef.current = true
        if (searchOpen) onDismissSearch()
      }}
      onTouchEnd={() => {
        if (searchOpen) onDismissSearch()
      }}
      onMomentumScrollBegin={() => {
        canLoadOlderRef.current = true
      }}
      onEndReachedThreshold={0.3}
      onEndReached={() => {
        if (!canLoadOlderRef.current) return
        if (hasOlderMessages && !isFetchingOlder) onFetchOlder()
      }}
      ListFooterComponent={
        isFetchingOlder ? (
          <View className="items-center py-4">
            <ActivityIndicator color="#00A884" />
          </View>
        ) : null
      }
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => onScrollOffset(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      onScrollToIndexFailed={({ index }: { index: number }) => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * 72),
          animated: true,
        })
      }}
      renderItem={renderItem}
      contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 6 }}
    />
  )
}

function chatMessagesListEqual(prev: ChatMessagesListProps, next: ChatMessagesListProps) {
  return (
    prev.data === next.data &&
    prev.highlightMessageId === next.highlightMessageId &&
    prev.contactName === next.contactName &&
    prev.contactAvatarUrl === next.contactAvatarUrl &&
    prev.searchOpen === next.searchOpen &&
    prev.isFetchingOlder === next.isFetchingOlder &&
    prev.hasOlderMessages === next.hasOlderMessages &&
    prev.onFetchOlder === next.onFetchOlder &&
    prev.onDismissSearch === next.onDismissSearch &&
    prev.onStickyDateChange === next.onStickyDateChange &&
    prev.onScrollOffset === next.onScrollOffset &&
    prev.onReply === next.onReply &&
    prev.onReplyQuotePress === next.onReplyQuotePress &&
    prev.onSwipeOpen === next.onSwipeOpen &&
    prev.onRetry === next.onRetry &&
    prev.onLongPress === next.onLongPress &&
    prev.listRef === next.listRef &&
    prev.canLoadOlderRef === next.canLoadOlderRef
  )
}

export const ChatMessagesList = memo(ChatMessagesListBase, chatMessagesListEqual)
