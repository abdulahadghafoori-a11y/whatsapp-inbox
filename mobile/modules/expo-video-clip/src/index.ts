import { Platform } from 'react-native'
import ExpoVideoClip from './ExpoVideoClipModule'

/** Stream-copy trim on Android (no FFmpeg). iOS callers should use react-native-video-trim. */
export async function clipVideo(
  inputUri: string,
  startMs: number,
  endMs: number,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('clipVideo is Android-only')
  }
  return ExpoVideoClip.clip(inputUri, startMs, endMs)
}
