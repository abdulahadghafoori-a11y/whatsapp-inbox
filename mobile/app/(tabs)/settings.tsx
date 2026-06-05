import { useEffect, useState } from 'react'
import { View, Text, Switch, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/Avatar'
import { PressableScale } from '@/components/PressableScale'
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from '@/lib/notificationPrefs'
import {
  clearPushRegistration,
  registerForPushNotifications,
} from '@/lib/push'
import { loadThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { hapticSelection, hapticWarning } from '@/lib/haptics'

export default function SettingsScreen() {
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const agent = useAuthStore((s) => s.agent)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  const [notificationsEnabled, setNotificationsEnabledState] = useState(true)
  const [theme, setThemeState] = useState<ThemePref>('system')

  useEffect(() => {
    void getNotificationsEnabled().then(setNotificationsEnabledState)
    void loadThemePref().then(setThemeState)
  }, [])

  async function toggleNotifications(next: boolean) {
    hapticSelection()
    setNotificationsEnabledState(next)
    await setNotificationsEnabled(next)
    if (next) {
      await registerForPushNotifications()
    } else {
      await clearPushRegistration()
    }
  }

  async function chooseTheme(next: ThemePref) {
    if (next !== theme) hapticSelection()
    setThemeState(next)
    await setThemePref(next)
  }

  async function logout() {
    hapticWarning()
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
    <View className="flex-1 bg-[#F7F8FA] dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="px-4 pb-3 pt-1">
          <Text className="text-[24px] font-bold tracking-tight text-white">Settings</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 dark:bg-wa-panel">
          <Avatar name={agent?.name} fallback={agent?.email ?? '?'} size={56} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-lg font-semibold text-neutral-900 dark:text-wa-textDark">
              {agent?.name}
            </Text>
            <Text numberOfLines={1} className="text-sm text-neutral-500 dark:text-wa-subDark">
              {agent?.email}
            </Text>
            <View className="mt-1.5 self-start rounded-full bg-wa-teal/10 px-2 py-0.5 dark:bg-wa-green/15">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-wa-teal dark:text-wa-green">
                {agent?.role}
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-white p-4 dark:bg-wa-panel">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-wa-teal/10 dark:bg-wa-green/15">
            <Ionicons name="notifications" size={18} color={isDark ? '#00A884' : '#008069'} />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-base font-medium text-neutral-900 dark:text-wa-textDark">Push notifications</Text>
            <Text className="text-xs text-neutral-500 dark:text-wa-subDark">
              Alerts for new replies and assignments.
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={(v) => void toggleNotifications(v)}
            trackColor={{ true: '#00A884', false: isDark ? '#3B4A54' : '#d1d5db' }}
            thumbColor="#ffffff"
            ios_backgroundColor={isDark ? '#3B4A54' : '#d1d5db'}
          />
        </View>

        <View className="mt-4 rounded-2xl bg-white p-4 dark:bg-wa-panel">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-wa-teal/10 dark:bg-wa-green/15">
              <Ionicons name="color-palette" size={18} color={isDark ? '#00A884' : '#008069'} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-medium text-neutral-900 dark:text-wa-textDark">Appearance</Text>
              <Text className="text-xs text-neutral-500 dark:text-wa-subDark">
                Choose how Sales Inbox looks.
              </Text>
            </View>
          </View>
          <View className="mt-3 flex-row gap-2">
            {(['system', 'light', 'dark'] as const).map((opt) => {
              const active = theme === opt
              const icon =
                opt === 'system' ? 'phone-portrait-outline' : opt === 'light' ? 'sunny-outline' : 'moon-outline'
              return (
                <PressableScale
                  key={opt}
                  onPress={() => void chooseTheme(opt)}
                  haptic="none"
                  scaleTo={0.95}
                  className={
                    'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ' +
                    (active ? 'bg-wa-teal' : 'bg-neutral-100 dark:bg-wa-elevated')
                  }
                >
                  <Ionicons
                    name={icon}
                    size={16}
                    color={active ? '#ffffff' : isDark ? '#C5CFD6' : '#404040'}
                  />
                  <Text
                    className={
                      'text-sm font-semibold capitalize ' +
                      (active ? 'text-white' : 'text-neutral-700 dark:text-neutral-300')
                    }
                  >
                    {opt}
                  </Text>
                </PressableScale>
              )
            })}
          </View>
        </View>

        <PressableScale
          onPress={() => void logout()}
          haptic="none"
          scaleTo={0.97}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-red-50 py-3.5 dark:bg-red-950/40"
        >
          <Ionicons name="log-out-outline" size={18} color={isDark ? '#f87171' : '#dc2626'} />
          <Text className="font-semibold text-red-600 dark:text-red-400">Log Out</Text>
        </PressableScale>

        <Text className="mt-6 text-center text-xs text-neutral-400 dark:text-wa-subDark">
          Sales Inbox v1.0.0
        </Text>
      </ScrollView>
    </View>
  )
}
