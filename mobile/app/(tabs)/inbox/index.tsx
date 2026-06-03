import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  RefreshControl,
  ActivityIndicator,
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
  type InboxFilter,
} from '@/hooks/useConversations'
import { apiErrorMessage } from '@/services/api'
import type { ConversationListItem } from '@/types'
import type Swipeable from 'react-native-gesture-handler/Swipeable'

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'mine', label: 'Mine' },
]

export default function InboxScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const markRead = useMarkRead()
  const markUnread = useMarkUnread()
  const openSwipeRef = useRef<Swipeable | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listInstance, setListInstance] = useState(0)

  const canLoadMore = useRef(false)
  const endReachedBusy = useRef(false)
  const returningFromChat = useRef(false)

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
      if (returningFromChat.current) {
        returningFromChat.current = false
        setListInstance((n) => n + 1)
      }

      return () => {
        canLoadMore.current = false
        endReachedBusy.current = false
        setLoadingMore(false)
        void queryClient.cancelQueries({ queryKey })
      }
    }, [queryKey, queryClient]),
  )

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
      <View className="bg-wa-teal px-4 pb-4 pt-2 shadow-sm">
        <Text className="text-[22px] font-bold tracking-tight text-white">Inbox</Text>
        <View className="mt-3 rounded-2xl bg-white px-4 shadow-sm">
          <TextInput
            placeholder="Search name or number"
            value={search}
            onChangeText={setSearch}
            className="py-3 text-[15px] text-neutral-900"
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
              className={`rounded-full px-4 py-2 ${active ? 'bg-wa-teal shadow-sm' : 'bg-neutral-100'}`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-neutral-600'}`}>
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
          key={`${filter}-${search}-${listInstance}`}
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ConversationListItem }) => (
            <SwipeableConversationItem
              conversation={item}
              onPress={(id) => {
                returningFromChat.current = true
                router.push(`/(tabs)/inbox/${id}`)
              }}
              onMarkRead={(id) => void onToggleRead(id, true)}
              onMarkUnread={(id) => void onToggleRead(id, false)}
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
