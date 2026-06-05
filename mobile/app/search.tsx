import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import {
  useGlobalMessageSearch,
  type MessageSearchResult,
} from '@/hooks/useGlobalMessageSearch'
import { Avatar } from '@/components/Avatar'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function snippet(result: MessageSearchResult): string {
  if (result.body?.trim()) return result.body.trim()
  return `[${result.type}]`
}

export default function SearchScreen() {
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(t)
  }, [input])

  const { data, isLoading, isFetching } = useGlobalMessageSearch(query)
  const results = data ?? []
  const hasQuery = query.trim().length >= 2

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="px-3 pb-4 pt-1">
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </Pressable>
            <Text className="text-[20px] font-bold tracking-tight text-white">Search messages</Text>
          </View>
          <View className="mt-3 flex-row items-center gap-2 rounded-full bg-white/95 px-4 dark:bg-wa-elevated">
            <Ionicons name="search" size={18} color={isDark ? '#8696A0' : '#54656f'} />
            <TextInput
              placeholder="Search all conversations"
              value={input}
              onChangeText={setInput}
              autoFocus
              className="flex-1 py-3 text-[16px] text-neutral-900 dark:text-wa-textDark"
              placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      </SafeAreaView>

      {!hasQuery ? (
        <View className="mt-20 items-center px-8">
          <Text className="text-center text-neutral-400 dark:text-wa-subDark">
            Type at least 2 characters to search message text across every conversation.
          </Text>
        </View>
      ) : isLoading || isFetching ? (
        <View className="mt-16 items-center">
          <ActivityIndicator color="#008069" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.messageId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/conversation/${item.conversationId}`)}
              className="flex-row items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 active:bg-neutral-50 dark:border-white/5 dark:bg-wa-panelDeep dark:active:bg-wa-panel"
            >
              <Avatar name={item.contactName} fallback={item.contactWaId} size={46} />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 font-semibold text-neutral-900 dark:text-wa-textDark" numberOfLines={1}>
                    {item.contactName ?? item.contactWaId}
                  </Text>
                  <Text className="ml-2 text-xs text-neutral-400 dark:text-wa-subDark">
                    {formatWhen(item.sentAt)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-[14px] text-neutral-600 dark:text-wa-subDark" numberOfLines={2}>
                  {item.direction === 'outbound' ? 'You: ' : ''}
                  {snippet(item)}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="mt-20 items-center">
              <Text className="text-neutral-400 dark:text-wa-subDark">No messages found</Text>
            </View>
          }
        />
      )}
    </View>
  )
}
