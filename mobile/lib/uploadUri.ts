import { Platform } from 'react-native'

/** URI shape React Native FormData expects for multipart uploads. */
export function resolveUploadUri(uri: string): string {
  if (!uri) return uri
  if (uri.startsWith('content://')) return uri
  if (uri.startsWith('file://')) return uri
  // iOS often returns bare paths; Android may use file:// already.
  if (Platform.OS === 'ios') return `file://${uri.replace(/^file:\/\//, '')}`
  return uri.startsWith('/') ? `file://${uri}` : uri
}
