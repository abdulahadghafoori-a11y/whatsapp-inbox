import '../global.css'
import { useEffect } from 'react'
import { useColorScheme } from 'nativewind'
import { Stack, useRouter, useRootNavigationState, useSegments } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { ToastProvider } from '@/components/Toast'
import { SocketBridge } from '@/components/SocketBridge'
import { SyncBridge } from '@/components/SyncBridge'
import { GlobalAudioHost } from '@/components/GlobalAudioHost'
import { OfflineSyncBridge } from '@/components/OfflineSyncBridge'
import { PushNotificationBridge } from '@/components/PushNotificationBridge'
import { MediaCacheBridge } from '@/components/MediaCacheBridge'
import { RootErrorBoundary } from '@/components/RootErrorBoundary'
import { queryPersister, queryClient, shouldDehydrateQuery } from '@/lib/queryClient'
import { stackTransitionOptions } from '@/lib/navigation'
import { initErrorReporting } from '@/lib/errorReporting'
import { initTheme } from '@/lib/theme'

initErrorReporting()
void initTheme()

if (__DEV__) {
  const api = process.env.EXPO_PUBLIC_API_URL ?? '(not set — using localhost fallback)'
  const socket = process.env.EXPO_PUBLIC_SOCKET_URL ?? api
  console.log('[env] EXPO_PUBLIC_API_URL=', api)
  console.log('[env] EXPO_PUBLIC_SOCKET_URL=', socket)
}

function AuthGate() {
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const segments = useSegments()
  const navigationReady = useRootNavigationState()?.key != null
  const segmentKey = segments.join('/')
  const hydrate = useAuthStore((s) => s.hydrate)
  const isHydrated = useAuthStore((s) => s.hydrated)
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!isHydrated || !navigationReady) return

    const root = segmentKey.split('/')[0] || undefined
    const inAuthGroup = root === '(auth)'
    const onBootstrap = root === 'index' || root === undefined

    const navigate = () => {
      try {
        if (!accessToken) {
          if (!inAuthGroup) router.replace('/(auth)/login')
          return
        }
        if (inAuthGroup || onBootstrap) {
          router.replace('/(tabs)/inbox')
        }
      } catch {
        // Navigator can be torn down during fast refresh / error recovery.
      }
    }

    const id = requestAnimationFrame(navigate)
    return () => cancelAnimationFrame(id)
  }, [isHydrated, accessToken, segmentKey, navigationReady, router])

  // Don't mount routes until auth hydration + navigation are ready — mounting
  // screens earlier triggers NativeWind/navigation context crashes on Android.
  if (!isHydrated || !navigationReady) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.boot]}>
        <ActivityIndicator size="large" color="#00A884" />
      </View>
    )
  }

  return (
    <>
      {accessToken ? <SocketBridge /> : null}
      {accessToken ? <SyncBridge /> : null}
      {accessToken ? <OfflineSyncBridge /> : null}
      {accessToken ? <MediaCacheBridge /> : null}
      {accessToken ? <PushNotificationBridge /> : null}
      {accessToken ? <GlobalAudioHost /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          contentStyle: { backgroundColor: isDark ? '#0B141A' : '#F7F8FA' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="conversation" options={stackTransitionOptions} />
        <Stack.Screen name="search" options={{ headerShown: false, ...stackTransitionOptions }} />
      </Stack>
    </>
  )
}

const styles = StyleSheet.create({
  boot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
  },
})

export default function RootLayout() {
  const { colorScheme: scheme } = useColorScheme()
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <KeyboardProvider preload={false}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: queryPersister,
              maxAge: 7 * 24 * 60 * 60 * 1000,
              dehydrateOptions: { shouldDehydrateQuery },
            }}
          >
            <ToastProvider>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <AuthGate />
            </ToastProvider>
          </PersistQueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  )
}
