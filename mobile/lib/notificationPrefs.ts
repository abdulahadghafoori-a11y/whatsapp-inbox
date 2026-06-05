import { appStorage } from '@/lib/appStorage'

const KEY = 'wa-notifications-enabled'

/** Push notifications are opt-out: enabled unless the user turned them off. */
export async function getNotificationsEnabled(): Promise<boolean> {
  const v = await appStorage.getItem(KEY)
  return v == null ? true : v === 'true'
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await appStorage.setItem(KEY, enabled ? 'true' : 'false')
}
