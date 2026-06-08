import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native'
import { type FlashListRef } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { InboxConversationList } from '@/components/InboxConversationList'
import { InboxSkeleton } from '@/components/Skeleton'
import { QueryError } from '@/components/QueryState'
import { useToast } from '@/components/Toast'
import { Avatar } from '@/components/Avatar'
import {
  useInbox,
  useMarkRead,
  useMarkUnread,
  usePinConversation,
  type InboxFilter,
} from '@/hooks/useConversations'
import {
  useGlobalMessageSearch,
  type MessageSearchResult,
} from '@/hooks/useGlobalMessageSearch'
import { apiErrorMessage } from '@/services/api'
import { formatTime } from '@/lib/format'
import type { ConversationListItem } from '@/types'
import { registerInboxScrollToTop } from '@/lib/inboxScroll'
import { userFacingLoadError } from '@/lib/userFacingError'
import { SocketConnectionBanner } from '@/components/SocketConnectionBanner'
import { hapticSelection } from '@/lib/haptics'
import { conversationHref } from '@/lib/scrollToChatMessage'
import { stabilizeConversationList } from '@/lib/inboxList'
import { hapticLight } from '@/lib/haptics'

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'mine', label: 'Mine' },
]

const filterStyles = StyleSheet.create({
  pill: {
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  pillActive: {
    backgroundColor: '#008069',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#525252',
  },
  labelActive: {
    color: '#ffffff',
  },
})

function messageSnippet(result: MessageSearchResult): string {
  if (result.body?.trim()) return result.body.trim()
  return `[${result.type}]`
}

export default function InboxScreen() {
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const toast = useToast()
  const markRead = useMarkRead()
  const markUnread = useMarkUnread()
  const pinConversation = usePinConversation()
  const listRef = useRef<FlashListRef<ConversationListItem>>(null)
  const conversationsById = useRef(new Map<string, ConversationListItem>())
  const searchInputRef = useRef<TextInput>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreBusy = useRef(false)

  const {
    conversations: rawConversations,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInbox(filter, search)

  const { data: messageHits, isFetching: messageSearchFetching } = useGlobalMessageSearch(search)
  const showMessageHits = search.trim().length >= 2

  const conversationsRef = useRef<ConversationListItem[]>([])
  const conversations = useMemo(() => {
    const stabilized = stabilizeConversationList(conversationsRef.current, rawConversations)
    conversationsRef.current = stabilized
    conversationsById.current = new Map(stabilized.map((c) => [c.id, c]))
    return stabilized
  }, [rawConversations])

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [filter, search])

  const dismissInboxSearch = useCallback(() => {
    setSearchFocused(false)
    setSearchInput('')
    setSearch('')
    searchInputRef.current?.blur()
    Keyboard.dismiss()
  }, [])

  useEffect(() => {
    registerInboxScrollToTop(() => {
      dismissInboxSearch()
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
    return () => registerInboxScrollToTop(null)
  }, [dismissInboxSearch])

  const onPullRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, refetch])

  const onToggleRead = useCallback(
    async (conversationId: string, currentlyUnread: boolean) => {
      try {
        if (currentlyUnread) await markRead.mutateAsync(conversationId)
        else await markUnread.mutateAsync(conversationId)
      } catch (err) {
        toast.show(apiErrorMessage(err), 'error')
      }
    },
    [markRead, markUnread, toast],
  )

  const onTogglePin = useCallback(
    async (conversationId: string, pinned: boolean) => {
      try {
        await pinConversation.mutateAsync({ conversationId, pinned })
      } catch (err) {
        toast.show(apiErrorMessage(err), 'error')
      }
    },
    [pinConversation, toast],
  )

  // Swipe-action adapters (stable refs so the memoized rows don't re-render).
  const onSwipeMarkRead = useCallback((id: string) => void onToggleRead(id, true), [onToggleRead])
  const onSwipeMarkUnread = useCallback(
    (id: string) => void onToggleRead(id, false),
    [onToggleRead],
  )
  const onSwipeTogglePin = useCallback(
    (id: string, pinned: boolean) => void onTogglePin(id, pinned),
    [onTogglePin],
  )

  const handleConversationPress = useCallback(
    (id: string) => {
      dismissInboxSearch()
      router.push(`/conversation/${id}`)
    },
    [dismissInboxSearch, router],
  )

  const handleConversationLongPress = useCallback(
    (id: string) => {
      const conversation = conversationsById.current.get(id)
      if (!conversation) return
      hapticLight()
      const isUnread = conversation.unreadCount > 0
      const isPinned = !!conversation.pinnedAt
      const pinLabel = isPinned ? 'Unpin' : 'Pin'
      const readLabel = isUnread ? 'Mark as read' : 'Mark as unread'
      const title = conversation.contact.name || conversation.contact.waId

      const onPick = (index: number) => {
        if (index === 0) void onTogglePin(id, !isPinned)
        if (index === 1) void onToggleRead(id, isUnread)
      }

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: [pinLabel, readLabel, 'Cancel'], cancelButtonIndex: 2, title },
          onPick,
        )
        return
      }

      Alert.alert(title, undefined, [
        { text: pinLabel, onPress: () => onPick(0) },
        { text: readLabel, onPress: () => onPick(1) },
        { text: 'Cancel', style: 'cancel' },
      ])
    },
    [onTogglePin, onToggleRead],
  )

  const onLoadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore || loadMoreBusy.current) return
    loadMoreBusy.current = true
    setLoadingMore(true)
    try {
      await fetchNextPage()
    } finally {
      loadMoreBusy.current = false
      setLoadingMore(false)
    }
  }, [fetchNextPage, hasNextPage, loadingMore])

  const onListScrollBeginDrag = useCallback(() => {
    if (searchFocused) dismissInboxSearch()
  }, [dismissInboxSearch, searchFocused])

  const messageResultsHeader = useMemo(() => {
    if (!showMessageHits) return null
    const hits = messageHits ?? []
    if (!hits.length && !messageSearchFetching) return null

    return (
      <View className="border-b border-neutral-100 bg-white dark:border-white/5 dark:bg-wa-panelDeep">
        <Text className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-wa-subDark">
          Messages
        </Text>
        {messageSearchFetching && !hits.length ? (
          <View className="items-center py-4">
            <ActivityIndicator color="#00A884" size="small" />
          </View>
        ) : null}
        {hits.map((item) => (
          <Pressable
            key={item.messageId}
            onPress={() => {
              dismissInboxSearch()
              router.push(conversationHref(item.conversationId, item.messageId))
            }}
            className="flex-row items-center gap-3 border-b border-neutral-50 px-4 py-3 active:bg-neutral-50 dark:border-white/5 dark:active:bg-wa-panel"
          >
            <Avatar name={item.contactName} fallback={item.contactWaId} size={44} />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-[15px] font-semibold text-neutral-900 dark:text-wa-textDark" numberOfLines={1}>
                  {item.contactName ?? item.contactWaId}
                </Text>
                <Text className="shrink-0 text-[12px] text-neutral-400 dark:text-wa-subDark">
                  {formatTime(item.sentAt)}
                </Text>
              </View>
              <Text className="mt-0.5 text-[14px] text-neutral-500 dark:text-wa-subDark" numberOfLines={2}>
                {item.direction === 'outbound' ? 'You: ' : ''}
                {messageSnippet(item)}
              </Text>
            </View>
          </Pressable>
        ))}
        {hits.length > 0 ? (
          <Text className="px-4 pb-2 pt-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-wa-subDark">
            Chats
          </Text>
        ) : null}
      </View>
    )
  }, [showMessageHits, messageHits, messageSearchFetching, router, dismissInboxSearch])

  const listEmpty = useMemo(() => {
    if (isLoading && conversations.length === 0) {
      return <InboxSkeleton />
    }
    if (!showMessageHits || (messageHits?.length ?? 0) === 0) {
      return (
        <View className="mt-20 items-center">
          <Text className="text-neutral-400 dark:text-wa-subDark">No conversations</Text>
        </View>
      )
    }
    return null
  }, [conversations.length, isLoading, messageHits, showMessageHits])

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={searchFocused ? dismissInboxSearch : undefined}
    >
      <View className="flex-1 bg-neutral-50 dark:bg-wa-panelDeep">
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
          <View className="px-4 pb-4 pt-1">
            <Text className="text-[24px] font-bold tracking-tight text-white">Chats</Text>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="mt-3 rounded-full bg-white/95 px-4 dark:bg-wa-elevated"
            >
              <TextInput
                ref={searchInputRef}
                placeholder="Search"
                value={searchInput}
                onChangeText={setSearchInput}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="py-3 text-[16px] text-neutral-900 dark:text-wa-textDark"
                placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </Pressable>
          </View>
        </SafeAreaView>

        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="flex-row gap-2 border-b border-neutral-100 bg-white px-4 py-3 dark:border-white/5 dark:bg-wa-panelDeep">
            {FILTERS.map((f) => {
              const active = filter === f.key
              const pillStyle = !active && isDark ? { backgroundColor: '#2A3942' } : null
              const labelStyle = !active && isDark ? { color: '#C5CFD6' } : null
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    if (f.key !== filter) hapticSelection()
                    setFilter(f.key)
                  }}
                  style={[filterStyles.pill, active ? filterStyles.pillActive : pillStyle]}
                >
                  <Text style={[filterStyles.label, active ? filterStyles.labelActive : labelStyle]}>
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Pressable>

        <SocketConnectionBanner />

        {isError ? (
          <QueryError
            message={userFacingLoadError(error, 'inbox')}
            onRetry={() => void refetch()}
          />
        ) : (
          <InboxConversationList
            listRef={listRef}
            conversations={conversations}
            header={messageResultsHeader}
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            loadingMore={loadingMore}
            hasNextPage={!!hasNextPage}
            onLoadMore={onLoadMore}
            onPress={handleConversationPress}
            onLongPress={handleConversationLongPress}
            onMarkRead={onSwipeMarkRead}
            onMarkUnread={onSwipeMarkUnread}
            onTogglePin={onSwipeTogglePin}
            onScrollBeginDrag={onListScrollBeginDrag}
            empty={listEmpty}
          />
        )}
      </View>
    </Pressable>
  )
}

