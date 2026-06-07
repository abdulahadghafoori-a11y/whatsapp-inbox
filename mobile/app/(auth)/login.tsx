import { useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import axios from 'axios'
import { API_BASE_URL, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { registerForPushNotifications } from '@/lib/push'
import { useToast } from '@/components/Toast'
import { hapticError, hapticSuccess } from '@/lib/haptics'
import type { AuthResponse } from '@/types'

const C = {
  bgLight: '#F7F8FA',
  bgDark: '#111B21',
  panelDark: '#202C33',
  teal: '#008069',
  textLight: '#171717',
  textDark: '#E9EDEF',
  subLight: '#737373',
  subDark: '#8696A0',
  borderLight: '#e5e5e5',
  disabledLight: '#d4d4d4',
  disabledDark: '#2A3942',
  white: '#ffffff',
  iconMutedLight: '#9ca3af',
  iconMutedDark: '#8696A0',
} as const

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const toast = useToast()

  const styles = useMemo(() => makeStyles(isDark), [isDark])
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading

  async function onSubmit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      // Bare client — must not run the 401 refresh interceptor (stale refresh
      // tokens in storage could restore the old session on a failed login).
      const res = await axios.post<AuthResponse>(
        `${API_BASE_URL}/api/auth/login`,
        { email: email.trim().toLowerCase(), password },
        { timeout: 20_000 },
      )
      hapticSuccess()
      await setSession(res.data.accessToken, res.data.refreshToken, res.data.agent)
      const { getNotificationsEnabled } = await import('@/lib/notificationPrefs')
      if (await getNotificationsEnabled()) {
        void registerForPushNotifications()
      }
    } catch (err) {
      hapticError()
      toast.show(apiErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="chatbubble-ellipses" size={40} color={C.white} />
          </View>
          <Text style={styles.title}>Sales Inbox</Text>
          <Text style={styles.subtitle}>Sign in to your team account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Ionicons name="mail-outline" size={19} color={styles.iconMuted.color} />
            <TextInput
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholderTextColor={styles.placeholder.color}
            />
          </View>
          <View style={styles.field}>
            <Ionicons name="lock-closed-outline" size={19} color={styles.iconMuted.color} />
            <TextInput
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={onSubmit}
              style={styles.input}
              placeholderTextColor={styles.placeholder.color}
            />
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={[styles.button, canSubmit ? styles.buttonOn : styles.buttonOff]}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: isDark ? C.bgDark : C.bgLight,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 48,
    },
    logo: {
      height: 80,
      width: 80,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: C.teal,
    },
    title: {
      marginTop: 20,
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: -0.5,
      color: isDark ? C.textDark : C.textLight,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 15,
      color: isDark ? C.subDark : C.subLight,
    },
    form: {
      gap: 12,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : C.borderLight,
      backgroundColor: isDark ? C.panelDark : C.white,
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      color: isDark ? C.textDark : C.textLight,
    },
    placeholder: {
      color: isDark ? C.iconMutedDark : C.iconMutedLight,
    },
    iconMuted: {
      color: isDark ? C.iconMutedDark : C.iconMutedLight,
    },
    button: {
      marginTop: 8,
      alignItems: 'center',
      borderRadius: 16,
      paddingVertical: 16,
    },
    buttonOn: {
      backgroundColor: C.teal,
    },
    buttonOff: {
      backgroundColor: isDark ? C.disabledDark : C.disabledLight,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: C.white,
    },
  })
}
