import * as FileSystem from 'expo-file-system/legacy'
import { resolveUploadUri } from '@/lib/uploadUri'
import { WA_AUDIO_MAX_BYTES } from '@/lib/waMediaLimits'

const MIN_BYTES = 200

/** Validate device-encoded OGG Opus voice note before upload. */
export async function prepareVoiceForSend(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const source = resolveUploadUri(uri)
  const info = await FileSystem.getInfoAsync(source)
  if (!info.exists) throw new Error('Recording file not found.')

  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0
  if (size < MIN_BYTES) {
    throw new Error('Recording is too short or empty.')
  }
  if (size > WA_AUDIO_MAX_BYTES) {
    throw new Error('Voice message is too large (max 16MB).')
  }

  const ext = name.toLowerCase().endsWith('.ogg') ? name : `voice-${Date.now()}.ogg`
  const dest = `${FileSystem.cacheDirectory}wa-voice-upload-${Date.now()}.ogg`
  await FileSystem.copyAsync({ from: source, to: dest })

  const headB64 = await FileSystem.readAsStringAsync(dest, {
    encoding: FileSystem.EncodingType.Base64,
  })
  if (!headB64.startsWith('T2dnUw')) {
    throw new Error('Invalid voice format. Please record again.')
  }

  return {
    uri: dest,
    name: ext,
    mimeType: mimeType.includes('ogg') ? 'audio/ogg' : 'audio/ogg',
  }
}
