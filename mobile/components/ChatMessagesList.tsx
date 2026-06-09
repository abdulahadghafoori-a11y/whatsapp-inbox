import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type RefObject,
} from 'react'
import { View, ActivityIndicator, Platform } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { FlatList } from 'react-native-gesture-handler'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import type { ViewToken } from 'react-native'
import { SwipeableMessageBubble } from '@/components/SwipeableMessageBubble'
import { ChatDatePill, ChatStickyDateBar } from '@/components/ChatDatePill'
import { buildChatListLayouts } from '@/lib/chatListItemLayout'
import type { ChatListItem } from '@/lib/chatListItems'
import {
  markPaginationAtLength,
  releasePaginationAtLength,
  resetPaginationTracker,
  shouldSkipPaginationAtLength,
  type PaginationLengthTracker,
} from '@/lib/chatListPagination'
import { getBurstAutoscrollThreshold, isBurstMode } from '@/lib/chatBurstMode'
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

const AT_BOTTOM_THRESHOLD = 48
const PREFILL_DEBOUNCE_MS = 500
const MAX_PREFILL_ATTEMPTS = 1
const MEDIA_VIEWPORT_THROTTLE_MS = 800

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
  onForward: (m: Message) => void
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
  onForward,
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
      showAvatar={item.showAvatar}
      showTail={item.showTail}
      groupPosition={item.groupPosition}
      onReply={onReply}
      onReplyQuotePress={onReplyQuotePress}
      highlight={highlightMessageId === msg.id}
      onSwipeOpen={onSwipeOpen}
      onRetry={onRetry}
      onLongPress={onLongPress}
      onForward={onForward}
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
    prev.onLongPress === next.onLongPress &&
    prev.onForward === next.onForward
  )
}

const ChatListRow = memo(ChatListRowBase, chatListRowEqual)

export type ChatMessagesListProps = {
  conversationId: string
  listRef: RefObject<FlatList<ChatListItem> | null>
  data: ChatListItem[]
  highlightMessageId: string | null
  contactName: string
  contactAvatarUrl?: string | null
  searchOpen: boolean
  isFetchingOlder: boolean
  hasOlderMessages: boolean
  canLoadOlderRef: MutableRefObject<boolean>
  onFetchOlder: () => void | Promise<unknown>
  onFetchOlderFailed?: () => void
  onDismissSearch: () => void
  onScrollOffset: (offsetY: number) => void
  onAtBottomChange?: (atBottom: boolean) => void
  onNeedsPrefill?: () => void
  onAnchorMessageChange?: (messageId: string | null) => void
  listHeader?: ReactElement | null
  onReply: (m: Message) => void
  onReplyQuotePress: (messageId: string) => void
  onSwipeOpen: (messageId: string, ref: Swipeable | null) => void
  onRetry: (m: Message) => void
  onLongPress: (m: Message, anchor: MessageAnchor) => void
  onForward: (m: Message) => void
}

function ChatMessagesListBase({
  conversationId,
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
  onFetchOlderFailed,
  onDismissSearch,
  onScrollOffset,
  onAtBottomChange,
  onNeedsPrefill,
  onAnchorMessageChange,
  listHeader,
  onReply,
  onReplyQuotePress,
  onSwipeOpen,
  onRetry,
  onLongPress,
  onForward,
}: ChatMessagesListProps) {
  const stickyDateRef = useRef('')
  const [stickyDateLabel, setStickyDateLabel] = useState('')
  const queryClient = useQueryClient()
  const viewportHeightRef = useRef(0)
  const contentHeightRef = useRef(0)
  const atBottomRef = useRef(true)
  const prefillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefillAttemptsRef = useRef(0)
  const mediaViewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestViewableItemsRef = useRef<ViewToken[]>([])
  const endReachedTrackerRef = useRef<PaginationLengthTracker>({})
  const fetchInFlightRef = useRef(false)
  const onFetchOlderRef = useRef(onFetchOlder)
  onFetchOlderRef.current = onFetchOlder

  useEffect(
    () => () => {
      if (mediaViewportTimerRef.current) clearTimeout(mediaViewportTimerRef.current)
      if (prefillTimerRef.current) clearTimeout(prefillTimerRef.current)
      clearVisibleMessageMedia()
    },
    [],
  )

  useEffect(() => {
    resetPaginationTracker(endReachedTrackerRef.current)
    prefillAttemptsRef.current = 0
    if (mediaViewportTimerRef.current) {
      clearTimeout(mediaViewportTimerRef.current)
      mediaViewportTimerRef.current = null
    }
    latestViewableItemsRef.current = []
    stickyDateRef.current = ''
    setStickyDateLabel('')
  }, [conversationId])

  const dataRef = useRef(data)
  dataRef.current = data

  const schedulePrefillCheck = useCallback(() => {
    if (!onNeedsPrefill || canLoadOlderRef.current) return
    if (prefillAttemptsRef.current >= MAX_PREFILL_ATTEMPTS) return
    if (prefillTimerRef.current) clearTimeout(prefillTimerRef.current)
    prefillTimerRef.current = setTimeout(() => {
      prefillTimerRef.current = null
      if (
        contentHeightRef.current > 0 &&
        viewportHeightRef.current > 0 &&
        contentHeightRef.current < viewportHeightRef.current
      ) {
        prefillAttemptsRef.current += 1
        onNeedsPrefill()
      }
    }, PREFILL_DEBOUNCE_MS)
  }, [canLoadOlderRef, onNeedsPrefill])

  const maybeFetchOlder = useCallback(() => {
    const len = dataRef.current.length
    if (!hasOlderMessages || isFetchingOlder || fetchInFlightRef.current) return
    if (shouldSkipPaginationAtLength(endReachedTrackerRef.current, len)) return
    fetchInFlightRef.current = true
    void Promise.resolve(onFetchOlderRef.current())
      .then(() => {
        markPaginationAtLength(endReachedTrackerRef.current, len)
      })
      .catch(() => {
        releasePaginationAtLength(endReachedTrackerRef.current, len)
        onFetchOlderFailed?.()
      })
      .finally(() => {
        fetchInFlightRef.current = false
      })
  }, [hasOlderMessages, isFetchingOlder, onFetchOlderFailed])

  const flushMediaViewport = useCallback(() => {
    const viewableItems = latestViewableItemsRef.current
    const viewport = buildChatMediaViewport(dataRef.current, viewableItems)
    setVisibleMessageIds(viewport.loadMessageIds)
    if (isBurstMode()) return
    if (viewport.presignCandidates.length) {
      void queueMediaPresignForMessages(queryClient, viewport.presignCandidates)
    }
    if (viewport.orderedMedia.length) syncVisibleMessageMedia(viewport.orderedMedia)
  }, [queryClient])

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let topIndex = -1
      let topDate: string | null = null
      let anchorMessageId: string | null = null

      latestViewableItemsRef.current = viewableItems
      if (mediaViewportTimerRef.current) clearTimeout(mediaViewportTimerRef.current)
      mediaViewportTimerRef.current = setTimeout(() => {
        mediaViewportTimerRef.current = null
        flushMediaViewport()
      }, MEDIA_VIEWPORT_THROTTLE_MS)

      for (const token of viewableItems) {
        const row = token.item as ChatListItem
        if (token.index == null || token.index <= topIndex) continue
        if (row.kind === 'date') {
          topIndex = token.index
          topDate = row.dateIso
        } else if (row.kind === 'message') {
          if (row.message.deletedAt) continue
          topIndex = token.index
          topDate = row.message.sentAt
          anchorMessageId = row.message.id
        }
      }

      onAnchorMessageChange?.(anchorMessageId)

      if (!topDate) return
      const label = formatDateLabel(topDate)
      if (label === stickyDateRef.current) return
      stickyDateRef.current = label
      setStickyDateLabel(label)
    },
    [flushMediaViewport, onAnchorMessageChange],
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
        onForward={onForward}
      />
    ),
    [
      contactAvatarUrl,
      contactName,
      onForward,
      onLongPress,
      onReply,
      onReplyQuotePress,
      onRetry,
      onSwipeOpen,
    ],
  )

  const maintainVisible = useMemo(
    () => ({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: getBurstAutoscrollThreshold(),
    }),
    [],
  )

  const handleScroll = useCallback(
    (offsetY: number) => {
      onScrollOffset(offsetY)
      const atBottom = offsetY <= AT_BOTTOM_THRESHOLD
      if (atBottom !== atBottomRef.current) {
        atBottomRef.current = atBottom
        onAtBottomChange?.(atBottom)
      }
    },
    [onAtBottomChange, onScrollOffset],
  )

  const listLayouts = useMemo(() => buildChatListLayouts(data), [data])
  const listLayoutsRef = useRef(listLayouts)
  listLayoutsRef.current = listLayouts

  const getItemLayout = useCallback(
    (_data: ChatListItem[] | null | undefined, index: number) => {
      const entry = listLayoutsRef.current[index]
      return entry ?? { length: 72, offset: index * 72, index }
    },
    [],
  )

  const listFooter = useMemo(
    () =>
      isFetchingOlder ? (
        <View className="items-center py-4">
          <ActivityIndicator color="#00A884" />
        </View>
      ) : null,
    [isFetchingOlder],
  )

  return (
    <View className="min-h-0 flex-1">
      <ChatStickyDateBar
        label={stickyDateLabel}
        visible={!searchOpen && stickyDateLabel.length > 0}
      />
      <FlatList
        ref={listRef}
        data={data}
        extraData={highlightMessageId}
        inverted
        getItemLayout={getItemLayout}
        getItemType={(item) => item.kind}
        initialNumToRender={28}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={16}
        windowSize={15}
        removeClippedSubviews={false}
        keyExtractor={(row) => row.id}
        showsVerticalScrollIndicator
        persistentScrollbar={Platform.OS === 'android'}
        overScrollMode={Platform.OS === 'android' ? 'never' : undefined}
        viewabilityConfigCallbackPairs={viewabilityPairs}
        maintainVisibleContentPosition={maintainVisible}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height
          schedulePrefillCheck()
        }}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h
          schedulePrefillCheck()
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
          maybeFetchOlder()
        }}
        ListHeaderComponent={listHeader ?? undefined}
        ListFooterComponent={listFooter}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index }: { index: number }) => {
          const entry = listLayoutsRef.current[index]
          listRef.current?.scrollToOffset({
            offset: Math.max(0, entry?.offset ?? index * 72),
            animated: true,
          })
        }}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 6 }}
      />
    </View>
  )
}

function chatMessagesListEqual(prev: ChatMessagesListProps, next: ChatMessagesListProps) {
  return (
    prev.conversationId === next.conversationId &&
    prev.data === next.data &&
    prev.highlightMessageId === next.highlightMessageId &&
    prev.contactName === next.contactName &&
    prev.contactAvatarUrl === next.contactAvatarUrl &&
    prev.searchOpen === next.searchOpen &&
    prev.isFetchingOlder === next.isFetchingOlder &&
    prev.hasOlderMessages === next.hasOlderMessages &&
    prev.onFetchOlder === next.onFetchOlder &&
    prev.onDismissSearch === next.onDismissSearch &&
    prev.onScrollOffset === next.onScrollOffset &&
    prev.onAtBottomChange === next.onAtBottomChange &&
    prev.onNeedsPrefill === next.onNeedsPrefill &&
    prev.onAnchorMessageChange === next.onAnchorMessageChange &&
    prev.listHeader === next.listHeader &&
    prev.onReply === next.onReply &&
    prev.onReplyQuotePress === next.onReplyQuotePress &&
    prev.onSwipeOpen === next.onSwipeOpen &&
    prev.onRetry === next.onRetry &&
    prev.onLongPress === next.onLongPress &&
    prev.onForward === next.onForward &&
    prev.listRef === next.listRef &&
    prev.canLoadOlderRef === next.canLoadOlderRef
  )
}

export const ChatMessagesList = memo(ChatMessagesListBase, chatMessagesListEqual)
