import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter, useFocusEffect } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { useQueryClient } from '@tanstack/react-query'
import { SwipeableConversationItem } from '@/components/SwipeableConversationItem'
import { QueryError } from '@/components/QueryState'
import { useToast } from '@/components/Toast'
import { Avatar } from '@/components/Avatar'
import {
  useConversations,
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
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import { registerInboxScrollToTop } from '@/lib/inboxScroll'
import { userFacingLoadError } from '@/lib/userFacingError'
import { SocketConnectionBanner } from '@/components/SocketConnectionBanner'
import { hapticSelection } from '@/lib/haptics'

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
  const queryClient = useQueryClient()
  const toast = useToast()
  const markRead = useMarkRead()
  const markUnread = useMarkUnread()
  const pinConversation = usePinConversation()
  const openSwipeRef = useRef<Swipeable | null>(null)
  const listRef = useRef<FlatList<ConversationListItem>>(null)
  const searchInputRef = useRef<TextInput>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const canLoadMore = useRef(false)
  const endReachedBusy = useRef(false)

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useConversations(filter, search)

  const { data: messageHits, isFetching: messageSearchFetching } = useGlobalMessageSearch(search)
  const showMessageHits = search.trim().length >= 2

  const conversations = useMemo(
    () => data?.pages.flatMap((p) => p.conversations) ?? [],
    [data],
  )

  const showSkeleton = isLoading && conversations.length === 0 && !showMessageHits

  const queryKey = useMemo(() => ['conversations', filter, search] as const, [filter, search])

  useFocusEffect(
    useCallback(() => {
      canLoadMore.current = false
      endReachedBusy.current = false
      setRefreshing(false)
      setLoadingMore(false)
      openSwipeRef.current?.close()
      openSwipeRef.current = null

      return () => {
        canLoadMore.current = false
        endReachedBusy.current = false
        setLoadingMore(false)
        void queryClient.cancelQueries({ queryKey })
      }
    }, [queryKey, queryClient]),
  )

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    registerInboxScrollToTop(() => {
      openSwipeRef.current?.close()
      dismissInboxSearch()
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
    return () => registerInboxScrollToTop(null)
  }, [])

  function dismissInboxSearch() {
    setSearchFocused(false)
    setSearchInput('')
    setSearch('')
    searchInputRef.current?.blur()
    Keyboard.dismiss()
  }

  async function onPullRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const onSwipeOpen = useCallback((id: string, ref: Swipeable | null) => {
    if (openSwipeRef.current && openSwipeRef.current !== ref) {
      openSwipeRef.current.close()
    }
    openSwipeRef.current = ref
  }, [])

  async function onToggleRead(conversationId: string, currentlyUnread: boolean) {
    try {
      if (currentlyUnread) await markRead.mutateAsync(conversationId)
      else await markUnread.mutateAsync(conversationId)
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
  }

  async function onTogglePin(conversationId: string, pinned: boolean) {
    try {
      await pinConversation.mutateAsync({ conversationId, pinned })
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
  }

  async function loadMore() {
    if (!hasNextPage || loadingMore || endReachedBusy.current) return
    endReachedBusy.current = true
    setLoadingMore(true)
    try {
      await fetchNextPage()
    } finally {
      endReachedBusy.current = false
      setLoadingMore(false)
    }
  }

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
              router.push(`/conversation/${item.conversationId}`)
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
  }, [showMessageHits, messageHits, messageSearchFetching, router])

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
        ) : showSkeleton ? (
          <SkeletonList />
        ) : (
          <FlatList
            ref={listRef}
            key={`${filter}-${search}`}
            data={conversations}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              canLoadMore.current = true
              if (searchFocused) dismissInboxSearch()
            }}
            ListHeaderComponent={messageResultsHeader}
            renderItem={({ item }: { item: ConversationListItem }) => (
              <Pressable onPress={(e) => e.stopPropagation()}>
                <SwipeableConversationItem
                  conversation={item}
                  onPress={(id) => {
                    openSwipeRef.current?.close()
                    dismissInboxSearch()
                    router.push(`/conversation/${id}`)
                  }}
                  onMarkRead={(id) => void onToggleRead(id, true)}
                  onMarkUnread={(id) => void onToggleRead(id, false)}
                  onTogglePin={(id, pinned) => void onTogglePin(id, pinned)}
                  onSwipeOpen={onSwipeOpen}
                />
              </Pressable>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
                tintColor="#00A884"
                colors={['#00A884']}
              />
            }
            onMomentumScrollBegin={() => {
              canLoadMore.current = true
            }}
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (!canLoadMore.current) return
              void loadMore()
            }}
            ListFooterComponent={
              loadingMore ? (
                <View className="items-center py-4">
                  <ActivityIndicator color="#00A884" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              !showMessageHits || (messageHits?.length ?? 0) === 0 ? (
                <View className="mt-20 items-center">
                  <Text className="text-neutral-400 dark:text-wa-subDark">No conversations</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Pressable>
  )
}

function SkeletonList() {
  return (
    <View className="px-4 pt-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 py-3">
          <View className="h-12 w-12 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <View className="flex-1 gap-2">
            <View className="h-3.5 rounded bg-neutral-200 dark:bg-neutral-800" style={{ width: '50%' }} />
            <View className="h-3 rounded bg-neutral-100 dark:bg-neutral-800/60" style={{ width: '75%' }} />
          </View>
        </View>
      ))}
    </View>
  )
}
