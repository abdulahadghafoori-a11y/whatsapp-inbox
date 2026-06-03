import { View, Text, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { useTeam } from '@/hooks/useTeam'
import { useAuthStore } from '@/stores/authStore'
import { formatTime } from '@/lib/format'
import { apiErrorMessage } from '@/services/api'
import type { Agent } from '@/types'

export default function TeamScreen() {
  const router = useRouter()
  const { data, isLoading, isError, error, refetch, isRefetching } = useTeam()
  const me = useAuthStore((s) => s.agent)

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      <View className="flex-row items-center justify-between bg-wa-teal px-4 pb-3 pt-2">
        <Text className="text-xl font-bold text-white">Team</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
          <Text className="text-lg text-white">⚙️</Text>
        </Pressable>
      </View>

      {isError ? (
        <QueryError
          message={`${apiErrorMessage(error)}. Check that the backend is running and reachable from your phone.`}
          onRetry={() => void refetch()}
        />
      ) : isLoading && !data ? (
        <QueryLoading label="Loading team…" />
      ) : (
      <FlatList
        data={data?.members ?? []}
        keyExtractor={(m) => m.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        renderItem={({ item }: { item: Agent }) => (
          <View className="flex-row items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-wa-teal">
              <Text className="font-semibold text-white">
                {item.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-neutral-900">
                {item.name}
                {me?.id === item.id ? ' (you)' : ''}
              </Text>
              <Text className="text-sm text-neutral-500">{item.email}</Text>
            </View>
            <View className="items-end">
              <View className="flex-row items-center gap-1.5">
                <View
                  className={`h-2 w-2 rounded-full ${item.isOnline ? 'bg-wa-green' : 'bg-neutral-300'}`}
                />
                <Text className="text-xs text-neutral-500">
                  {item.isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
              {item.role === 'admin' && (
                <Text className="mt-1 text-[10px] font-medium uppercase text-wa-teal">Admin</Text>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="mt-20 items-center px-6">
            <Text className="text-neutral-400">No team members found</Text>
          </View>
        }
        ListFooterComponent={
          (data?.aiAgents.length ?? 0) > 0 ? (
            <View className="mt-4 px-4">
              <Text className="mb-1 text-xs font-semibold uppercase text-neutral-400">
                AI agents
              </Text>
              {data?.aiAgents.map((a) => (
                <View key={a.id} className="flex-row items-center gap-2 py-2">
                  <Text className="text-lg">🤖</Text>
                  <Text className="text-neutral-700">{a.name}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />
      )}
      <View className="px-4 py-2">
        <Text className="text-center text-[11px] text-neutral-400">
          Updated {formatTime(new Date().toISOString())}
        </Text>
      </View>
    </SafeAreaView>
  )
}
