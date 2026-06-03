import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export default function SettingsScreen() {
  const router = useRouter()
  const agent = useAuthStore((s) => s.agent)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  async function logout() {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    } catch {
      /* ignore network errors on logout */
    } finally {
      await clear()
      router.replace('/(auth)/login')
    }
  }

  return (
    <View className="flex-1 bg-neutral-50 px-4 pt-4">
      <View className="rounded-xl bg-white p-4">
        <Text className="text-lg font-semibold text-neutral-900">{agent?.name}</Text>
        <Text className="text-sm text-neutral-500">{agent?.email}</Text>
        <Text className="mt-1 text-xs uppercase text-wa-teal">{agent?.role}</Text>
      </View>

      <Pressable
        onPress={logout}
        className="mt-4 items-center rounded-xl bg-red-50 py-3.5 active:bg-red-100"
      >
        <Text className="font-semibold text-red-600">Log Out</Text>
      </Pressable>

      <Text className="mt-6 text-center text-xs text-neutral-400">
        Sales Inbox v1.0.0
      </Text>
    </View>
  )
}
