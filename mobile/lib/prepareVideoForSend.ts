import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { Video, getVideoMetaData } from 'react-native-compressor'
import { trim } from 'react-native-video-trim'
import { resolveUploadUri } from '@/lib/uploadUri'
import {
  WA_VIDEO_MAX_BYTES,
  WA_VIDEO_MAX_DURATION_MS,
  WA_VIDEO_HD_MAX_EDGE,
  WA_VIDEO_STANDARD_MAX_EDGE,
} from '@/lib/waMediaLimits'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import { sanitizeUploadFilename } from '@/lib/prepareUpload'

/** Manual bitrate steps when auto output still exceeds the 16MB cap. */
const HD_FIT_CAP_BITRATES = [480_000, 360_000, 280_000, 200_000] as const
const STANDARD_FIT_CAP_BITRATES = [280_000, 200_000, 128_000] as const

/** Rough bytes/sec for trim UI size hints. */
const TRIM_BYTES_PER_SEC_HD = 900_000
const TRIM_BYTES_PER_SEC_STANDARD = 450_000

export type VideoPrepareOpts = {
  startMs?: number
  endMs?: number
  /** Default HD — matches WhatsApp gallery send. */
  videoQuality?: MediaQualityTier
  onProgress?: (progress: number) => void
}

function isNativeVideoEngineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('ExceptionInInitializerError') ||
    msg.includes('FFmpegKit failed to start') ||
    msg.includes('UnsatisfiedLinkError') ||
    msg.includes('HostFunction') ||
    msg.includes("Cannot find native module 'ExpoVideoClip'") ||
    msg.includes('expo-video-clip')
  )
}

function nativeVideoEngineMessage(): string {
  return Platform.OS === 'android'
    ? 'Video trim needs a native rebuild. Run: npx expo run:android — or use Send as document.'
    : 'Video processing failed. Please try again or send as document.'
}

/** Copy gallery/picker URIs to a stable cache file — native trim/compress is flaky with content://. */
async function ensureStableVideoFile(uri: string): Promise<string> {
  const resolved = resolveUploadUri(uri)
  const needsCopy =
    Platform.OS === 'android' ||
    resolved.startsWith('content://') ||
    /rn_image_picker|ImagePicker|DocumentPicker/i.test(resolved)

  if (!needsCopy) {
    const info = await FileSystem.getInfoAsync(resolved)
    if (info.exists) return resolved
  }

  const dest = `${FileSystem.cacheDirectory}wa-video-src-${Date.now()}.mp4`
  await FileSystem.copyAsync({ from: resolved, to: dest })
  const copied = await FileSystem.getInfoAsync(dest)
  if (!copied.exists) {
    throw new Error('Could not prepare video file for processing.')
  }
  return dest
}

/** react-native-compressor expects file:// on Android. */
function uriForCompressor(uri: string): string {
  const u = resolveUploadUri(uri)
  if (Platform.OS === 'android' && u.startsWith('/') && !u.startsWith('file://')) {
    return `file://${u}`
  }
  return u
}

export function estimateTrimmedVideoBytes(
  sourceSizeBytes: number,
  sourceDurationMs: number,
  startMs: number,
  endMs: number,
): number {
  if (sourceDurationMs < 1) return sourceSizeBytes
  const selectedMs = Math.max(500, endMs - startMs)
  const ratio = selectedMs / sourceDurationMs
  return Math.round(sourceSizeBytes * ratio)
}

export function trimSelectionMayExceedCap(
  sourceSizeBytes: number,
  sourceDurationMs: number,
  startMs: number,
  endMs: number,
  videoQuality: MediaQualityTier = 'hd',
): boolean {
  const est = estimateTrimmedVideoBytes(sourceSizeBytes, sourceDurationMs, startMs, endMs)
  const selectedSec = Math.max(0.5, (endMs - startMs) / 1000)
  const bytesPerSec =
    videoQuality === 'hd' ? TRIM_BYTES_PER_SEC_HD : TRIM_BYTES_PER_SEC_STANDARD
  return est > WA_VIDEO_MAX_BYTES || selectedSec * bytesPerSec > WA_VIDEO_MAX_BYTES
}

export type VideoSourceInfo = {
  uri: string
  sizeBytes: number
  durationMs: number
}

export async function getVideoSourceInfo(uri: string): Promise<VideoSourceInfo> {
  const resolved = await ensureStableVideoFile(uri)
  const info = await FileSystem.getInfoAsync(resolved)
  if (!info.exists) throw new Error('Video file not found.')
  const sizeBytes = 'size' in info && typeof info.size === 'number' ? info.size : 0
  let durationMs = 0
  try {
    const meta = await getVideoMetaData(uriForCompressor(resolved))
    durationMs = Math.round((meta.duration ?? 0) * 1000)
  } catch {
    /* optional */
  }
  return { uri: resolved, sizeBytes, durationMs }
}

export function videoNeedsTrim(info: VideoSourceInfo): boolean {
  return (
    info.sizeBytes > WA_VIDEO_MAX_BYTES ||
    (info.durationMs > 0 && info.durationMs > WA_VIDEO_MAX_DURATION_MS)
  )
}

export async function trimVideoSegment(
  uri: string,
  startMs: number,
  endMs: number,
): Promise<string> {
  const input = uriForCompressor(await ensureStableVideoFile(uri))
  const start = Math.max(0, Math.floor(startMs))
  const end = Math.max(startMs + 500, Math.floor(endMs))

  // Android: MediaExtractor/Muxer clip — no FFmpeg (FFmpegKit fails on many devices).
  if (Platform.OS === 'android') {
    try {
      const { clipVideo } = await import('expo-video-clip')
      const clipped = await clipVideo(input, start, end)
      return resolveUploadUri(clipped)
    } catch (err) {
      if (isNativeVideoEngineError(err)) {
        throw new Error(nativeVideoEngineMessage())
      }
      throw err
    }
  }

  try {
    const result = await trim(input, {
      startTime: start,
      endTime: end,
      type: 'video',
      outputExt: 'mp4',
      enablePreciseTrimming: true,
    })
    if (!result.success || !result.outputPath) {
      throw new Error('Could not trim video. Please try a shorter clip.')
    }
    return resolveUploadUri(result.outputPath)
  } catch (err) {
    if (isNativeVideoEngineError(err)) {
      throw new Error(nativeVideoEngineMessage())
    }
    throw err
  }
}

/** WhatsApp-style auto transcode (react-native-compressor matches official client). */
async function transcodeLikeWhatsApp(
  uri: string,
  videoQuality: MediaQualityTier,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const maxSize =
    videoQuality === 'hd' ? WA_VIDEO_HD_MAX_EDGE : WA_VIDEO_STANDARD_MAX_EDGE
  try {
    return await Video.compress(
      uriForCompressor(uri),
      {
        compressionMethod: 'auto',
        minimumFileSizeForCompress: 0,
        maxSize,
      },
      onProgress,
    )
  } catch (err) {
    if (isNativeVideoEngineError(err)) {
      throw new Error(nativeVideoEngineMessage())
    }
    throw err
  }
}

/**
 * Second pass when auto output exceeds 16MB — step down bitrate.
 * Android skips maxSize on manual pass (react-native-compressor#380 corruption).
 */
async function transcodeToFitCap(
  uri: string,
  videoQuality: MediaQualityTier,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const bitrates =
    videoQuality === 'hd' ? HD_FIT_CAP_BITRATES : STANDARD_FIT_CAP_BITRATES
  const maxEdge =
    videoQuality === 'hd' ? WA_VIDEO_HD_MAX_EDGE : WA_VIDEO_STANDARD_MAX_EDGE
  let working = uriForCompressor(uri)
  for (const bitrate of bitrates) {
    working = await Video.compress(
      working,
      {
        compressionMethod: 'manual',
        bitrate,
        minimumFileSizeForCompress: 0,
        ...(Platform.OS === 'ios' ? { maxSize: maxEdge } : {}),
      },
      onProgress,
    )
    const info = await getVideoSourceInfo(working)
    if (info.sizeBytes <= WA_VIDEO_MAX_BYTES) return working
  }
  return working
}

/** Compress and/or validate video for WhatsApp upload (H.264 MP4, ≤16MB). */
export async function prepareVideoForSend(
  uri: string,
  filename: string,
  opts?: VideoPrepareOpts,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const videoQuality = opts?.videoQuality ?? 'hd'
  let working = await ensureStableVideoFile(uri)

  if (opts?.startMs != null && opts?.endMs != null && opts.endMs > opts.startMs) {
    working = await trimVideoSegment(working, opts.startMs, opts.endMs)
  }

  working = await transcodeLikeWhatsApp(working, videoQuality, opts?.onProgress)
  let info = await getVideoSourceInfo(working)

  if (info.sizeBytes > WA_VIDEO_MAX_BYTES) {
    working = await transcodeToFitCap(working, videoQuality, opts?.onProgress)
    info = await getVideoSourceInfo(working)
  }

  if (info.sizeBytes > WA_VIDEO_MAX_BYTES) {
    throw new Error(
      'Video is still too large after trimming. Select a shorter clip or send as document.',
    )
  }

  if (info.durationMs > WA_VIDEO_MAX_DURATION_MS) {
    throw new Error('Video is too long. WhatsApp allows up to 16 minutes.')
  }

  const safeName = sanitizeUploadFilename(filename)
  const name = safeName.toLowerCase().endsWith('.mp4')
    ? safeName
    : safeName.replace(/\.[^.]+$/, '') + '.mp4'

  const dest = `${FileSystem.cacheDirectory}wa-video-${Date.now()}.mp4`
  await FileSystem.copyAsync({ from: working, to: dest })

  return { uri: dest, name, mimeType: 'video/mp4' }
}
