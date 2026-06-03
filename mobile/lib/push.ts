import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { api } from '@/services/api'

function resolveExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  )
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Requests notification permission, fetches the Expo push token, and registers
 * it with the backend (PATCH /api/team/me). Safe to call repeatedly.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null

  // Remote push in Expo Go requires a dev build + EAS project (SDK 53+).
  if (Constants.appOwnership === 'expo') return null

  const projectId = resolveExpoProjectId()
  if (!projectId) return null

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#25D366',
    })
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
    const token = tokenData.data
    try {
      await api.patch('/team/me', { expoPushToken: token })
    } catch {
      // Non-fatal; the inbox still works without push.
    }
    return token
  } catch {
    return null
  }
}
