import * as FileSystem from 'expo-file-system/legacy'
import { appStorage } from '@/lib/appStorage'
import { hashMediaFile, hashMediaFileLarge } from '@/lib/mediaContentHash'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
export type PreparedCachePayload = {
  fileUri: string
  fileName: string
  mimeType: string
  /** SHA-256 of the prepared bytes, computed once at cache time and reused. */
  contentHash?: string | null
}

const INDEX_KEY = 'wa-prepared-media-cache-v1'
const CACHE_DIR = `${FileSystem.cacheDirectory}wa-prepared/`
const MAX_CACHE_BYTES = 200 * 1024 * 1024

export type PrepareCacheOptions = {
  mimeType: string
  videoTrim?: { startMs: number; endMs: number }
  videoQuality?: MediaQualityTier
  imageQuality?: MediaQualityTier
  sendAsDocument?: boolean
}

type CacheEntry = {
  key: string
  fileUri: string
  fileName: string
  mimeType: string
  contentHash: string | null
  sizeBytes: number
  cachedAt: string
}

type CacheIndex = Record<string, CacheEntry>

let indexMem: CacheIndex | null = null

function stableOptions(opts: PrepareCacheOptions): string {
  return JSON.stringify({
    mimeType: opts.mimeType,
    sendAsDocument: !!opts.sendAsDocument,
    imageQuality: opts.imageQuality ?? 'hd',
    videoQuality: opts.videoQuality ?? 'hd',
    trim: opts.videoTrim
      ? { start: opts.videoTrim.startMs, end: opts.videoTrim.endMs }
      : null,
  })
}

async function loadIndex(): Promise<CacheIndex> {
  if (indexMem) return indexMem
  const raw = await appStorage.getItem(INDEX_KEY)
  indexMem = raw ? (JSON.parse(raw) as CacheIndex) : {}
  return indexMem
}

async function saveIndex(index: CacheIndex) {
  indexMem = index
  await appStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
  }
}

async function fingerprintSource(uri: string): Promise<string | null> {
  const resolved = resolveUploadUri(uri)
  const hash = await hashMediaFile(resolved)
  if (hash) return hash
  const large = await hashMediaFileLarge(resolved)
  if (large) return large
  try {
    const info = await FileSystem.getInfoAsync(resolved)
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return `weak:${info.size}:${resolved}`
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function buildPrepareCacheKey(
  sourceUri: string,
  opts: PrepareCacheOptions,
): Promise<string | null> {
  const fp = await fingerprintSource(sourceUri)
  if (!fp) return null
  return `${fp}|${stableOptions(opts)}`
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return info.exists
  } catch {
    return false
  }
}

export async function getPreparedFromCache(
  cacheKey: string,
): Promise<PreparedCachePayload | null> {
  const index = await loadIndex()
  const entry = index[cacheKey]
  if (!entry) return null
  if (!(await fileExists(entry.fileUri))) {
    delete index[cacheKey]
    await saveIndex(index)
    return null
  }
  return {
    fileUri: entry.fileUri,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    contentHash: entry.contentHash,
  }
}

export async function getPreparedContentHash(cacheKey: string): Promise<string | null> {
  const index = await loadIndex()
  return index[cacheKey]?.contentHash ?? null
}

async function evictIfNeeded(index: CacheIndex) {
  let total = Object.values(index).reduce((sum, e) => sum + e.sizeBytes, 0)
  if (total <= MAX_CACHE_BYTES) return

  const sorted = Object.entries(index).sort(
    (a, b) => new Date(a[1].cachedAt).getTime() - new Date(b[1].cachedAt).getTime(),
  )
  const target = MAX_CACHE_BYTES * 0.9
  for (const [key, entry] of sorted) {
    if (total <= target) break
    try {
      await FileSystem.deleteAsync(entry.fileUri, { idempotent: true })
    } catch {
      /* ignore */
    }
    delete index[key]
    total -= entry.sizeBytes
  }
}

export async function putPreparedInCache(
  cacheKey: string,
  payload: PreparedCachePayload,
  contentHash?: string | null,
): Promise<void> {
  await ensureCacheDir()
  const index = await loadIndex()
  const resolved = resolveUploadUri(payload.fileUri)
  if (!(await fileExists(resolved))) return

  const ext = payload.fileName.includes('.')
    ? payload.fileName.slice(payload.fileName.lastIndexOf('.'))
    : '.bin'
  const dest = `${CACHE_DIR}${cacheKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)}${ext}`

  if (resolved !== dest) {
    try {
      const destInfo = await FileSystem.getInfoAsync(dest)
      if (!destInfo.exists) {
        await FileSystem.copyAsync({ from: resolved, to: dest })
      }
    } catch {
      return
    }
  }

  let sizeBytes = 0
  try {
    const info = await FileSystem.getInfoAsync(dest)
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      sizeBytes = info.size
    }
  } catch {
    /* ignore */
  }

  const old = index[cacheKey]
  if (old?.fileUri && old.fileUri !== dest) {
    try {
      await FileSystem.deleteAsync(old.fileUri, { idempotent: true })
    } catch {
      /* ignore */
    }
  }

  index[cacheKey] = {
    key: cacheKey,
    fileUri: dest,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    contentHash: contentHash ?? null,
    sizeBytes,
    cachedAt: new Date().toISOString(),
  }
  await evictIfNeeded(index)
  await saveIndex(index)
}
