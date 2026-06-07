import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const ACCESS = 'access_token'
const REFRESH = 'refresh_token'

/** SecureStore is native-only; web uses AsyncStorage (localStorage). */
const useSecureStore = Platform.OS !== 'web'

async function read(key: string): Promise<string | null> {
  if (useSecureStore) return SecureStore.getItemAsync(key)
  return AsyncStorage.getItem(key)
}

async function write(key: string, value: string): Promise<void> {
  if (useSecureStore) {
    await SecureStore.setItemAsync(key, value)
    return
  }
  await AsyncStorage.setItem(key, value)
}

async function remove(key: string): Promise<void> {
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(key)
    return
  }
  await AsyncStorage.removeItem(key)
}

export const tokenStorage = {
  async get() {
    const [accessToken, refreshToken] = await Promise.all([
      read(ACCESS),
      read(REFRESH),
    ])
    return { accessToken, refreshToken }
  },
  async set(accessToken: string, refreshToken: string) {
    await Promise.all([write(ACCESS, accessToken), write(REFRESH, refreshToken)])
  },
  async clear() {
    await Promise.all([remove(ACCESS), remove(REFRESH)])
  },
}
