import * as FileSystem from 'expo-file-system/legacy'
import { resolveUploadUri } from '@/lib/uploadUri'

const MIN_BYTES = 200
const FLUSH_ATTEMPTS = 8
const FLUSH_DELAY_MS = 250

async function waitForFile(fileUri: string): Promise<FileSystem.FileInfo> {
  for (let i = 0; i < FLUSH_ATTEMPTS; i++) {
    const info = await FileSystem.getInfoAsync(fileUri)
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size >= MIN_BYTES) {
      return info
    }
    await new Promise((r) => setTimeout(r, FLUSH_DELAY_MS))
  }
  const info = await FileSystem.getInfoAsync(fileUri)
  if (!info.exists) {
    throw new Error('Recording file not found. Please try again.')
  }
  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0
  if (size < MIN_BYTES) {
    throw new Error('Recording is too short or empty. Hold the mic for at least one second.')
  }
  return info
}

/**
 * Copy recording to cache with a stable URI + extension before upload.
 */
export async function prepareUploadFile(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const sourceUri = resolveUploadUri(uri)
  await waitForFile(sourceUri)

  const ext = name.includes('.') ? (name.split('.').pop() ?? 'm4a') : 'm4a'
  const dest = `${FileSystem.cacheDirectory}wa-upload-${Date.now()}.${ext}`
  await FileSystem.copyAsync({ from: sourceUri, to: dest })

  const destInfo = await FileSystem.getInfoAsync(dest)
  const size = 'size' in destInfo && typeof destInfo.size === 'number' ? destInfo.size : 0
  if (size < MIN_BYTES) {
    throw new Error('Could not prepare recording for upload.')
  }

  const normalizedMime =
    ext === '3gp' || ext === 'amr' ? 'audio/amr' : 'audio/mp4'

  return { uri: dest, name, mimeType: normalizedMime }
}

/** Read prepared audio as base64 — avoids React Native FormData corrupting binary uploads. */
export async function readPreparedAudioBase64(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ name: string; mimeType: string; data: string }> {
  const prepared = await prepareUploadFile(uri, name, mimeType)
  const data = await FileSystem.readAsStringAsync(prepared.uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  if (!data || data.length < 280) {
    throw new Error('Recording could not be read. Please try again.')
  }
  return {
    name: prepared.name,
    mimeType: prepared.mimeType,
    data,
  }
}
