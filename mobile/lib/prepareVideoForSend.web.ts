import * as FileSystem from 'expo-file-system/legacy'
import { resolveUploadUri } from '@/lib/uploadUri'
import {
  WA_VIDEO_MAX_BYTES,
  WA_VIDEO_MAX_DURATION_MS,
} from '@/lib/waMediaLimits'

export type VideoSourceInfo = {
  uri: string
  sizeBytes: number
  durationMs: number
}

export async function getVideoSourceInfo(uri: string): Promise<VideoSourceInfo> {
  const resolved = resolveUploadUri(uri)
  const info = await FileSystem.getInfoAsync(resolved)
  if (!info.exists) throw new Error('Video file not found.')
  const sizeBytes = 'size' in info && typeof info.size === 'number' ? info.size : 0
  return { uri: resolved, sizeBytes, durationMs: 0 }
}

export function videoNeedsTrim(info: VideoSourceInfo): boolean {
  return info.sizeBytes > WA_VIDEO_MAX_BYTES
}

export function estimateTrimmedVideoBytes(
  sourceSizeBytes: number,
  sourceDurationMs: number,
  startMs: number,
  endMs: number,
): number {
  if (sourceDurationMs < 1) return sourceSizeBytes
  return Math.round(sourceSizeBytes * (Math.max(500, endMs - startMs) / sourceDurationMs))
}

export function trimSelectionMayExceedCap(
  sourceSizeBytes: number,
  sourceDurationMs: number,
  startMs: number,
  endMs: number,
): boolean {
  return estimateTrimmedVideoBytes(sourceSizeBytes, sourceDurationMs, startMs, endMs) > WA_VIDEO_MAX_BYTES
}

export async function trimVideoSegment(): Promise<string> {
  throw new Error('Video trim is not available in the browser. Use the Android or iOS app.')
}

export async function prepareVideoForSend(
  uri: string,
  filename: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const working = resolveUploadUri(uri)
  const info = await getVideoSourceInfo(working)

  if (info.sizeBytes > WA_VIDEO_MAX_BYTES) {
    throw new Error('Video is too large for web upload (max 16MB). Use the mobile app.')
  }
  if (info.durationMs > WA_VIDEO_MAX_DURATION_MS) {
    throw new Error('Video is too long. WhatsApp allows up to 16 minutes.')
  }

  const name = filename.toLowerCase().endsWith('.mp4')
    ? filename
    : filename.replace(/\.[^.]+$/, '') + '.mp4'

  const dest = `${FileSystem.cacheDirectory}wa-video-${Date.now()}.mp4`
  await FileSystem.copyAsync({ from: working, to: dest })

  return { uri: dest, name, mimeType: 'video/mp4' }
}
