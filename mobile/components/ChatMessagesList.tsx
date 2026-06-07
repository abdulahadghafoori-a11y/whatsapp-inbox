import { memo, useCallback, useRef, type MutableRefObject, type RefObject } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { FlatList } from 'react-native-gesture-handler'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import type { ViewToken } from 'react-native'
import { SwipeableMessageBubble } from '@/components/SwipeableMessageBubble'
import { ChatDatePill } from '@/components/ChatDatePill'
import type { ChatListItem } from '@/lib/chatListItems'
import { formatDateLabel } from '@/lib/format'
import type { MessageAnchor } from '@/components/MessageActionsOverlay'
import { syncVisibleMessageMedia } from '@/lib/messageMediaSync'
import type { Message } from '@/types'

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

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let topIndex = -1
      let topDate: string | null = null
      const visibleMedia: Message[] = []

      for (const token of viewableItems) {
        if (token.index == null || token.index <= topIndex) continue
        const row = token.item as ChatListItem
        if (row.kind === 'date') {
          topIndex = token.index
          topDate = row.dateIso
        } else if (row.kind === 'message') {
          topIndex = token.index
          topDate = row.message.sentAt
          const msg = row.message
          if (msg.type !== 'text' && msg.type !== 'location') {
            visibleMedia.push(msg)
          }
        }
      }

      if (visibleMedia.length) syncVisibleMessageMedia(visibleMedia)

      if (!topDate) return
      const label = formatDateLabel(topDate)
      if (label === stickyDateRef.current) return
      stickyDateRef.current = label
      onStickyDateChange(label)
    },
    [onStickyDateChange],
  )

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current
  const viewabilityPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged },
  ]).current

  const renderItem = useCallback(
    ({ item }: { item: ChatListItem }) => {
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
    },
    [
      contactAvatarUrl,
      contactName,
      highlightMessageId,
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
      inverted
      initialNumToRender={10}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews={false}
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
      onScrollToIndexFailed={({ index }) => {
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

export const ChatMessagesList = memo(ChatMessagesListBase)
