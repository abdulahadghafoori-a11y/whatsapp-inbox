import { useMemo, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { useConversationMediaGallery } from '@/hooks/useMessageFeatures'
import { useMediaUrl } from '@/hooks/useMedia'
import { conversationHref } from '@/lib/scrollToChatMessage'

function GalleryThumb({
  item,
  size,
  onPress,
}: {
  item: import('@/hooks/useMessageFeatures').MediaGalleryItem
  size: number
  onPress: () => void
}) {
  const key = item.mediaThumbUrl ?? item.mediaUrl
  const { data: url } = useMediaUrl(key, item.id)
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, padding: 1 }}>
      {url ? (
        <Image source={{ uri: url }} style={{ flex: 1, borderRadius: 4 }} contentFit="cover" />
      ) : (
        <View className="flex-1 items-center justify-center rounded bg-neutral-200 dark:bg-wa-elevated">
          <Ionicons
            name={item.type === 'video' ? 'videocam' : 'image'}
            size={28}
            color="#8696A0"
          />
        </View>
      )}
    </Pressable>
  )
}

export default function ConversationMediaGalleryScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const conversationId = String(id)
  const { width } = useWindowDimensions()
  const tile = Math.floor((width - 8) / 3)
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all')
  const query = useConversationMediaGallery(conversationId, filter)
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="flex-row items-center gap-1 px-3 pb-3 pt-1">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </Pressable>
          <Text className="flex-1 text-[20px] font-bold text-white">Media</Text>
        </View>
        <View className="flex-row gap-2 px-4 pb-3">
          {(['all', 'image', 'video'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 ${filter === key ? 'bg-white/25' : 'bg-white/10'}`}
            >
              <Text className="text-[12px] font-medium capitalize text-white">
                {key === 'all' ? 'All' : key === 'image' ? 'Photos' : 'Videos'}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00A884" />
        </View>
      ) : (
        <FlashList
          data={items}
          numColumns={3}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
          }}
          ListEmptyComponent={
            <Text className="mt-12 text-center text-neutral-500 dark:text-wa-subDark">
              No media in this chat
            </Text>
          }
          renderItem={({ item }) => (
            <GalleryThumb
              item={item}
              size={tile}
              onPress={() => router.push(conversationHref(conversationId, item.id))}
            />
          )}
        />
      )}
    </View>
  )
}
