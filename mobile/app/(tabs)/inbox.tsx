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
import { StatusBar } from 'expo-status-bar'
import { useRouter, useFocusEffect } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
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
import { userFacingLoadError } from '@/lib/userFacingError'
import { SocketConnectionBanner } from '@/components/SocketConnectionBanner'
import { hapticSelection } from '@/lib/haptics'

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
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [searchInput, setSearchInput] = useState('')
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
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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
    <View className="flex-1 bg-neutral-50 dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
      <View className="px-4 pb-4 pt-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-[24px] font-bold tracking-tight text-white">Chats</Text>
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={10}
            accessibilityLabel="Search messages"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="search" size={22} color="#ffffff" />
          </Pressable>
        </View>
        <View className="mt-3 rounded-full bg-white/95 px-4 dark:bg-wa-elevated">
          <TextInput
            placeholder="Search name or number"
            value={searchInput}
            onChangeText={setSearchInput}
            className="py-3 text-[16px] text-neutral-900 dark:text-wa-textDark"
            placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>
      </SafeAreaView>

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
              tintColor="#00A884"
              colors={['#00A884']}
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
                <ActivityIndicator color="#00A884" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="mt-20 items-center">
              <Text className="text-neutral-400 dark:text-wa-subDark">No conversations</Text>
            </View>
          }
        />
      )}
    </View>
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
