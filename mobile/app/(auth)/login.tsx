import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { registerForPushNotifications } from '@/lib/push'
import { useToast } from '@/components/Toast'
import { PressableScale } from '@/components/PressableScale'
import { hapticError, hapticSuccess } from '@/lib/haptics'
import type { AuthResponse } from '@/types'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const toast = useToast()

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading

  async function onSubmit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      const res = await api.post<AuthResponse>('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      })
      hapticSuccess()
      await setSession(res.data.accessToken, res.data.refreshToken, res.data.agent)
      void registerForPushNotifications()
    } catch (err) {
      hapticError()
      toast.show(apiErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F8FA] dark:bg-wa-panelDeep">
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-12 items-center">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-wa-teal shadow-lg">
            <Ionicons name="chatbubble-ellipses" size={40} color="#ffffff" />
          </View>
          <Text className="mt-5 text-[26px] font-bold tracking-tight text-neutral-900 dark:text-wa-textDark">
            Sales Inbox
          </Text>
          <Text className="mt-1 text-[15px] text-neutral-500 dark:text-wa-subDark">
            Sign in to your team account
          </Text>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white px-4 dark:border-white/5 dark:bg-wa-panel">
            <Ionicons name="mail-outline" size={19} color={isDark ? '#8696A0' : '#9ca3af'} />
            <TextInput
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              className="flex-1 py-3.5 text-base text-neutral-900 dark:text-wa-textDark"
              placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
            />
          </View>
          <View className="flex-row items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white px-4 dark:border-white/5 dark:bg-wa-panel">
            <Ionicons name="lock-closed-outline" size={19} color={isDark ? '#8696A0' : '#9ca3af'} />
            <TextInput
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={onSubmit}
              className="flex-1 py-3.5 text-base text-neutral-900 dark:text-wa-textDark"
              placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
            />
          </View>

          <PressableScale
            onPress={onSubmit}
            haptic="none"
            disabled={!canSubmit}
            scaleTo={0.97}
            className={`mt-2 items-center rounded-2xl py-4 ${
              canSubmit ? 'bg-wa-teal shadow-md' : 'bg-neutral-300 dark:bg-wa-elevated'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">Sign In</Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
