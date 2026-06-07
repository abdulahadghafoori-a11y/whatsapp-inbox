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

/** Decode %20-style names from gallery pickers; strip path segments. */
export function sanitizeUploadFilename(name: string): string {
  let decoded = name
  try {
    decoded = decodeURIComponent(name)
  } catch {
    /* keep */
  }
  const base = decoded.split(/[/\\]/).pop() ?? 'file'
  const safe = base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 200)
  return safe || `file-${Date.now()}`
}

function extFromName(name: string, fallback: string): string {
  if (!name.includes('.')) return fallback
  return name.split('.').pop() ?? fallback
}

/**
 * Copy voice recording to cache with a stable URI before upload (waits for recorder flush).
 */
export async function prepareUploadFile(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const sourceUri = resolveUploadUri(uri)
  await waitForFile(sourceUri)

  const ext = extFromName(name, 'm4a')
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

/**
 * Copy gallery/camera media to cache — images are compressed separately via prepareImageSend.
 */
export async function prepareMediaFileForUpload(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const sourceUri = resolveUploadUri(uri)
  const info = await FileSystem.getInfoAsync(sourceUri)
  if (!info.exists) {
    throw new Error('File not found. Please try again.')
  }

  const ext = extFromName(
    name,
    mimeType.startsWith('video/') ? 'mp4' : mimeType.includes('png') ? 'png' : 'jpg',
  )
  const dest = `${FileSystem.cacheDirectory}wa-upload-${Date.now()}.${ext}`
  await FileSystem.copyAsync({ from: sourceUri, to: dest })

  return { uri: dest, name: sanitizeUploadFilename(name), mimeType }
}

/** Read OGG Opus voice note as base64 for JSON upload. */
export async function readPreparedAudioBase64(
  uri: string,
  name: string,
  mimeType: string,
): Promise<{ name: string; mimeType: string; data: string }> {
  const { prepareVoiceForSend } = await import('@/lib/prepareVoiceForSend')
  const prepared = await prepareVoiceForSend(uri, name, mimeType)
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
