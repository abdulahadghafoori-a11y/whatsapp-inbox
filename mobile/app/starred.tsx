import { useMemo } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useStarredMessages } from '@/hooks/useMessageFeatures'
import { conversationHref } from '@/lib/scrollToChatMessage'
import { formatMessageTime } from '@/lib/format'

export default function StarredMessagesScreen() {
  const router = useRouter()
  const query = useStarredMessages()
  const messages = useMemo(
    () => query.data?.pages.flatMap((p) => p.messages) ?? [],
    [query.data],
  )

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="flex-row items-center gap-1 px-3 pb-4 pt-1">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-[20px] font-bold text-white">Starred messages</Text>
        </View>
      </SafeAreaView>

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00A884" />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
          }}
          ListEmptyComponent={
            <Text className="mt-12 text-center text-neutral-500 dark:text-wa-subDark">
              No starred messages yet
            </Text>
          }
          renderItem={({ item }) => {
            const contactName =
              query.data?.pages.find((p) => p.contactNames[item.id])?.contactNames[item.id] ??
              'Chat'
            const preview = item.body?.trim() || `[${item.type}]`
            return (
              <Pressable
                onPress={() => router.push(conversationHref(item.conversationId, item.id))}
                className="mb-2 rounded-xl bg-white px-4 py-3 dark:bg-wa-panel"
              >
                <Text className="text-[13px] font-semibold text-wa-teal dark:text-wa-green">
                  {contactName}
                </Text>
                <Text numberOfLines={2} className="mt-1 text-[15px] text-neutral-800 dark:text-wa-textDark">
                  {preview}
                </Text>
                <Text className="mt-1 text-[11px] text-neutral-400 dark:text-wa-subDark">
                  {formatMessageTime(item.starredAt ?? item.sentAt)}
                </Text>
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}
