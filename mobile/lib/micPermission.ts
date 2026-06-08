import { Platform, PermissionsAndroid } from 'react-native'

let cachedGranted: boolean | null = null

/** Check mic permission without prompting (call when chat opens). */
export async function warmMicPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    cachedGranted = true
    return
  }
  try {
    cachedGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    )
  } catch {
    cachedGranted = null
  }
}

/** Request mic permission if needed; uses cached check when already granted. */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  if (cachedGranted === true) return true

  const already = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  )
  if (already) {
    cachedGranted = true
    return true
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  )
  cachedGranted = granted === PermissionsAndroid.RESULTS.GRANTED
  return cachedGranted
}
