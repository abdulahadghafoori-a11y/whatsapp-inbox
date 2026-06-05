import { View, Text, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { Avatar } from '@/components/Avatar'
import { useTeam } from '@/hooks/useTeam'
import { useAuthStore } from '@/stores/authStore'
import { formatTime } from '@/lib/format'
import { apiErrorMessage } from '@/services/api'
import type { Agent } from '@/types'

export default function TeamScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useTeam()
  const me = useAuthStore((s) => s.agent)

  return (
    <View className="flex-1 bg-[#F7F8FA] dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="px-4 pb-3 pt-1">
          <Text className="text-[24px] font-bold tracking-tight text-white">Team</Text>
        </View>
      </SafeAreaView>

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
          <View className="flex-row items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 dark:border-white/5 dark:bg-wa-panelDeep">
            <View className="relative">
              <Avatar name={item.name} size={48} />
              {item.isOnline ? (
                <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-wa-green dark:border-wa-panelDeep" />
              ) : null}
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-neutral-900 dark:text-wa-textDark">
                {item.name}
                {me?.id === item.id ? ' (you)' : ''}
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-wa-subDark">{item.email}</Text>
            </View>
            <View className="items-end">
              <View className="flex-row items-center gap-1.5">
                <View
                  className={`h-2 w-2 rounded-full ${item.isOnline ? 'bg-wa-green' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                />
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
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
            <Text className="text-neutral-400 dark:text-neutral-500">No team members found</Text>
          </View>
        }
        ListFooterComponent={
          (data?.aiAgents.length ?? 0) > 0 ? (
            <View className="mt-4 px-4">
              <Text className="mb-1 text-xs font-semibold uppercase text-neutral-400">
                AI agents
              </Text>
              {data?.aiAgents.map((a) => (
                <View key={a.id} className="flex-row items-center gap-2.5 py-2">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/20">
                    <Ionicons name="sparkles" size={18} color="#9B59F6" />
                  </View>
                  <Text className="text-neutral-700 dark:text-neutral-300">{a.name}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />
      )}
      <View className="px-4 py-2">
        <Text className="text-center text-[11px] text-neutral-400 dark:text-wa-subDark">
          Updated {formatTime(new Date().toISOString())}
        </Text>
      </View>
    </View>
  )
}
