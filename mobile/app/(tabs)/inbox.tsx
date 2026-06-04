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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { SwipeableConversationItem } from '@/components/SwipeableConversationItem'
import { QueryError } from '@/components/QueryState'
import { useToast } from '@/components/Toast'
import {
  useConversations,
  useMarkRead,
  useMarkUnread,
  usePinConversation,
  type InboxFilter,
} from '@/hooks/useConversations'
import { apiErrorMessage } from '@/services/api'
import type { ConversationListItem } from '@/types'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import { registerInboxScrollToTop } from '@/lib/inboxScroll'

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'mine', label: 'Mine' },
]

/** NativeWind: no className on Pressable here — breaks React Navigation context (see nativewind#1712). */
const filterStyles = StyleSheet.create({
  pill: {
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  pillActive: {
    backgroundColor: '#128C7E',
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

export default function InboxScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const markRead = useMarkRead()
  const markUnread = useMarkUnread()
  const pinConversation = usePinConversation()
  const openSwipeRef = useRef<Swipeable | null>(null)
  const listRef = useRef<FlatList<ConversationListItem>>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
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

  const conversations = useMemo(
    () => data?.pages.flatMap((p) => p.conversations) ?? [],
    [data],
  )

  const showSkeleton = isLoading && conversations.length === 0

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
    registerInboxScrollToTop(() => {
      openSwipeRef.current?.close()
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
    return () => registerInboxScrollToTop(null)
  }, [])

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

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      <View className="bg-wa-teal px-4 pb-4 pt-2">
        <Text className="text-[24px] font-bold tracking-tight text-white">Inbox</Text>
        <View className="mt-3 rounded-2xl bg-white px-4">
          <TextInput
            placeholder="Search name or number"
            value={search}
            onChangeText={setSearch}
            className="py-3.5 text-[16px] text-neutral-900"
            placeholderTextColor="#9ca3af"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <View className="flex-row gap-2 border-b border-neutral-100 bg-white px-4 py-3">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[filterStyles.pill, active ? filterStyles.pillActive : null]}
            >
              <Text style={[filterStyles.label, active ? filterStyles.labelActive : null]}>
                {f.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {isError ? (
        <QueryError
          message={`${apiErrorMessage(error)}. Check that the backend is running and EXPO_PUBLIC_API_URL in mobile/.env matches your PC IP.`}
          onRetry={() => void refetch()}
        />
      ) : showSkeleton ? (
        <SkeletonList />
      ) : (
        <FlatList
          ref={listRef}
          key={`${filter}-${search}`}
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ConversationListItem }) => (
            <SwipeableConversationItem
              conversation={item}
              onPress={(id) => {
                openSwipeRef.current?.close()
                router.push(`/conversation/${id}`)
              }}
              onMarkRead={(id) => void onToggleRead(id, true)}
              onMarkUnread={(id) => void onToggleRead(id, false)}
              onTogglePin={(id, pinned) => void onTogglePin(id, pinned)}
              onSwipeOpen={onSwipeOpen}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor="#128C7E"
              colors={['#128C7E']}
            />
          }
          onScrollBeginDrag={() => {
            canLoadMore.current = true
          }}
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
                <ActivityIndicator color="#128C7E" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="mt-20 items-center">
              <Text className="text-neutral-400">No conversations</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

function SkeletonList() {
  return (
    <View className="px-4 pt-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 py-3">
          <View className="h-12 w-12 rounded-full bg-neutral-200" />
          <View className="flex-1 gap-2">
            <View className="h-3.5 rounded bg-neutral-200" style={{ width: '50%' }} />
            <View className="h-3 rounded bg-neutral-100" style={{ width: '75%' }} />
          </View>
        </View>
      ))}
    </View>
  )
}
