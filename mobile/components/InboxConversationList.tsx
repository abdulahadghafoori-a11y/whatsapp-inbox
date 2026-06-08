import { memo, useCallback, useRef, type ReactElement, type RefObject } from 'react'
import { View, ActivityIndicator, RefreshControl } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import { SwipeableConversationItem } from '@/components/SwipeableConversationItem'
import type { ConversationListItem } from '@/types'

const ListFooter = memo(function ListFooter({ loading }: { loading: boolean }) {
  if (!loading) return null
  return (
    <View className="items-center py-4">
      <ActivityIndicator color="#00A884" />
    </View>
  )
})

export type InboxConversationListProps = {
  listRef: RefObject<FlashListRef<ConversationListItem> | null>
  conversations: ConversationListItem[]
  header: ReactElement | null
  refreshing: boolean
  onRefresh: () => void
  loadingMore: boolean
  hasNextPage: boolean
  onLoadMore: () => void
  onPress: (id: string) => void
  onLongPress: (id: string) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onScrollBeginDrag: () => void
  empty: ReactElement | null
}

export const InboxConversationList = memo(function InboxConversationList({
  listRef,
  conversations,
  header,
  refreshing,
  onRefresh,
  loadingMore,
  hasNextPage,
  onLoadMore,
  onPress,
  onLongPress,
  onMarkRead,
  onMarkUnread,
  onTogglePin,
  onScrollBeginDrag,
  empty,
}: InboxConversationListProps) {
  const canLoadMore = useRef(false)
  // Track the single currently-open swipe row so opening another closes it
  // (matches WhatsApp — only one chat reveals its actions at a time).
  const openRef = useRef<{ id: string; ref: Swipeable | null } | null>(null)

  const handleSwipeOpen = useCallback((id: string, ref: Swipeable | null) => {
    if (openRef.current && openRef.current.id !== id) {
      openRef.current.ref?.close()
    }
    openRef.current = { id, ref }
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: ConversationListItem }) => (
      <SwipeableConversationItem
        conversation={item}
        onPress={onPress}
        onLongPress={onLongPress}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
        onTogglePin={onTogglePin}
        onSwipeOpen={handleSwipeOpen}
      />
    ),
    [onPress, onLongPress, onMarkRead, onMarkUnread, onTogglePin, handleSwipeOpen],
  )

  const handleEndReached = useCallback(() => {
    if (!canLoadMore.current || !hasNextPage || loadingMore) return
    onLoadMore()
  }, [hasNextPage, loadingMore, onLoadMore])

  return (
    <FlashList
      ref={listRef}
      style={{ flex: 1 }}
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header ?? undefined}
      ListFooterComponent={<ListFooter loading={loadingMore} />}
      ListEmptyComponent={empty}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#00A884"
          colors={['#00A884']}
        />
      }
      onScrollBeginDrag={() => {
        canLoadMore.current = true
        onScrollBeginDrag()
      }}
      onMomentumScrollBegin={() => {
        canLoadMore.current = true
      }}
      onEndReachedThreshold={0.4}
      onEndReached={handleEndReached}
    />
  )
})
