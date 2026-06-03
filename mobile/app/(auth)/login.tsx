import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { registerForPushNotifications } from '@/lib/push'
import { useToast } from '@/components/Toast'
import type { AuthResponse } from '@/types'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
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
      await setSession(res.data.accessToken, res.data.refreshToken, res.data.agent)
      void registerForPushNotifications()
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-10 items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-wa-teal">
            <Text className="text-3xl">💬</Text>
          </View>
          <Text className="mt-4 text-2xl font-bold text-neutral-900">Sales Inbox</Text>
          <Text className="mt-1 text-neutral-500">Sign in to your team account</Text>
        </View>

        <View className="gap-3">
          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base"
            placeholderTextColor="#9ca3af"
          />
          <TextInput
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base"
            placeholderTextColor="#9ca3af"
          />

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            className={`mt-2 items-center rounded-xl py-3.5 ${
              canSubmit ? 'bg-wa-teal' : 'bg-neutral-300'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-semibold text-white">Sign In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
