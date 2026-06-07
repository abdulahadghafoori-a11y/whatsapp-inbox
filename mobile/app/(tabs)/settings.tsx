import { useEffect, useState } from 'react'
import { View, Text, Switch, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/Avatar'
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from '@/lib/notificationPrefs'
import {
  clearPushRegistration,
  registerForPushNotifications,
} from '@/lib/push'
import { loadThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import {
  getMediaDownloadPrefs,
  setMediaDownloadPref,
  type DownloadPolicy,
  type MediaDownloadPrefs,
} from '@/lib/mediaDownloadPrefs'
import { hapticSelection, hapticWarning } from '@/lib/haptics'

const DOWNLOAD_ROWS: {
  key: keyof MediaDownloadPrefs
  label: string
}[] = [
  { key: 'photo', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Voice messages' },
  { key: 'document', label: 'Documents' },
]

const DOWNLOAD_POLICIES: { key: DownloadPolicy; label: string }[] = [
  { key: 'always', label: 'Always' },
  { key: 'wifi', label: 'Wi‑Fi only' },
  { key: 'never', label: 'Never' },
]

const THEME_OPTIONS: { key: ThemePref; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
]

/** NativeWind className on Pressable breaks navigation context (nativewind#1712). */
const themeStyles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
    padding: 4,
  },
  segmentDark: {
    backgroundColor: '#2A3942',
  },
  option: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  optionActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  optionActiveDark: {
    backgroundColor: '#111B21',
  },
  optionLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#667781',
  },
  optionLabelActive: {
    color: '#008069',
  },
  optionLabelActiveDark: {
    color: '#00A884',
  },
  optionLabelDark: {
    color: '#8696A0',
  },
})

const logoutStyles = StyleSheet.create({
  button: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDark: {
    backgroundColor: '#111B21',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#EA0038',
    textAlign: 'center',
  },
})

export default function SettingsScreen() {
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const agent = useAuthStore((s) => s.agent)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  const [notificationsEnabled, setNotificationsEnabledState] = useState(true)
  const [theme, setThemeState] = useState<ThemePref>('system')
  const [downloadPrefs, setDownloadPrefsState] = useState<MediaDownloadPrefs | null>(null)

  useEffect(() => {
    void getNotificationsEnabled().then(setNotificationsEnabledState)
    void loadThemePref().then(setThemeState)
    void getMediaDownloadPrefs().then(setDownloadPrefsState)
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
    <View className="flex-1 bg-[#F0F2F5] dark:bg-wa-panelDeep">
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="px-4 pb-3 pt-1">
          <Text className="text-[22px] font-semibold text-white">Settings</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View className="overflow-hidden rounded-xl bg-white dark:bg-wa-panel">
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Avatar name={agent?.name} fallback={agent?.email ?? '?'} size={56} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[17px] font-semibold text-neutral-900 dark:text-wa-textDark">
                {agent?.name}
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-[14px] text-neutral-500 dark:text-wa-subDark">
                {agent?.email}
              </Text>
              <View className="mt-2 self-start rounded-md bg-wa-teal/10 px-2 py-0.5 dark:bg-wa-green/15">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-wa-teal dark:text-wa-green">
                  {agent?.role}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-3 overflow-hidden rounded-xl bg-white dark:bg-wa-panel">
          <View className="flex-row items-center px-4 py-3.5">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#E7F5F1] dark:bg-wa-green/15">
              <Ionicons name="notifications-outline" size={20} color={isDark ? '#00A884' : '#008069'} />
            </View>
            <Text className="flex-1 text-[16px] text-neutral-900 dark:text-wa-textDark">Push notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => void toggleNotifications(v)}
              trackColor={{ true: '#00A884', false: isDark ? '#3B4A54' : '#d1d5db' }}
              thumbColor="#ffffff"
              ios_backgroundColor={isDark ? '#3B4A54' : '#d1d5db'}
            />
          </View>
        </View>

        <View className="mt-3 overflow-hidden rounded-xl bg-white dark:bg-wa-panel">
          <View className="flex-row items-center px-4 py-3.5">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#E7F5F1] dark:bg-wa-green/15">
              <Ionicons name="cloud-download-outline" size={20} color={isDark ? '#00A884' : '#008069'} />
            </View>
            <Text className="flex-1 text-[16px] text-neutral-900 dark:text-wa-textDark">Storage & data</Text>
          </View>
          {downloadPrefs
            ? DOWNLOAD_ROWS.map((row) => (
                <View
                  key={row.key}
                  className="border-t border-neutral-100 px-4 py-3 dark:border-wa-border/40"
                >
                  <Text className="mb-2 text-[14px] font-medium text-neutral-800 dark:text-wa-textDark">
                    {row.label}
                  </Text>
                  <View className="flex-row gap-2">
                    {DOWNLOAD_POLICIES.map((opt) => {
                      const active = downloadPrefs[row.key] === opt.key
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => {
                            hapticSelection()
                            void setMediaDownloadPref(row.key, opt.key).then(() =>
                              setDownloadPrefsState((p) =>
                                p ? { ...p, [row.key]: opt.key } : p,
                              ),
                            )
                          }}
                          className={`rounded-full px-3 py-1.5 ${
                            active
                              ? 'bg-wa-teal/15 dark:bg-wa-green/20'
                              : 'bg-neutral-100 dark:bg-wa-panelDeep'
                          }`}
                        >
                          <Text
                            className={`text-[12px] font-medium ${
                              active
                                ? 'text-wa-teal dark:text-wa-green'
                                : 'text-neutral-500 dark:text-wa-subDark'
                            }`}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ))
            : null}
        </View>

        <View className="mt-3 overflow-hidden rounded-xl bg-white p-4 dark:bg-wa-panel">
          <View className="mb-3 flex-row items-center">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#E7F5F1] dark:bg-wa-green/15">
              <Ionicons name="color-palette-outline" size={20} color={isDark ? '#00A884' : '#008069'} />
            </View>
            <Text className="text-[16px] text-neutral-900 dark:text-wa-textDark">Appearance</Text>
          </View>
          <View style={[themeStyles.segment, isDark && themeStyles.segmentDark]}>
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.key
              const iconColor = active
                ? isDark
                  ? '#00A884'
                  : '#008069'
                : isDark
                  ? '#8696A0'
                  : '#667781'
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => void chooseTheme(opt.key)}
                  style={[
                    themeStyles.option,
                    active && themeStyles.optionActive,
                    active && isDark && themeStyles.optionActiveDark,
                  ]}
                >
                  <Ionicons name={opt.icon} size={18} color={iconColor} />
                  <Text
                    style={[
                      themeStyles.optionLabel,
                      isDark && themeStyles.optionLabelDark,
                      active && themeStyles.optionLabelActive,
                      active && isDark && themeStyles.optionLabelActiveDark,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <Pressable
          onPress={() => void logout()}
          style={[logoutStyles.button, isDark && logoutStyles.buttonDark]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <View style={logoutStyles.inner}>
            <Ionicons name="log-out-outline" size={20} color="#EA0038" />
            <Text style={logoutStyles.label}>Log out</Text>
          </View>
        </Pressable>

        <Text className="mt-8 text-center text-[12px] text-neutral-400 dark:text-wa-subDark">
          Sales Inbox v1.0.0
        </Text>
      </ScrollView>
    </View>
  )
}
