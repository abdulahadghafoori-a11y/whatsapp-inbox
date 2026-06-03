import '../global.css'
import { useEffect } from 'react'
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
import { GlobalAudioHost } from '@/components/GlobalAudioHost'
import { OfflineSyncBridge } from '@/components/OfflineSyncBridge'
import { queryPersister, queryClient, shouldDehydrateQuery } from '@/lib/queryClient'

function AuthGate() {
  const router = useRouter()
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

  return (
    <>
      {accessToken ? <SocketBridge /> : null}
      {accessToken ? <OfflineSyncBridge /> : null}
      {accessToken ? <GlobalAudioHost /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: 'Settings', presentation: 'modal' }}
        />
      </Stack>
      {!isHydrated ? (
        <View
          style={StyleSheet.absoluteFillObject}
          className="items-center justify-center bg-white"
        >
          <ActivityIndicator size="large" color="#128C7E" />
        </View>
      ) : null}
    </>
  )
}

export default function RootLayout() {
  return (
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
            <StatusBar style="dark" />
            <AuthGate />
          </ToastProvider>
        </PersistQueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
