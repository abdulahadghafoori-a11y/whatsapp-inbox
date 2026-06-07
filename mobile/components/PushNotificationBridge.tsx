import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { registerForPushNotifications } from '@/lib/push'
import { getNotificationsEnabled } from '@/lib/notificationPrefs'
import { useAuthStore } from '@/stores/authStore'

/**
 * Was: no handler when user taps a notification — now opens the conversation.
 */
export function PushNotificationBridge() {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!accessToken) return
    void getNotificationsEnabled().then((enabled) => {
      if (enabled) void registerForPushNotifications()
    })
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return

    const openConversationFromNotification = (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return
      const conversationId = response.notification.request.content.data?.conversationId
      if (typeof conversationId === 'string') {
        router.push(`/conversation/${conversationId}`)
      }
    }

    void Notifications.getLastNotificationResponseAsync().then(openConversationFromNotification)

    const sub = Notifications.addNotificationResponseReceivedListener(openConversationFromNotification)
    return () => sub.remove()
  }, [router, accessToken])

  return null
}
