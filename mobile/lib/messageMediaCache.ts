import * as FileSystem from 'expo-file-system/legacy'
import { Image as RNImage } from 'react-native'
import { appStorage } from '@/lib/appStorage'
import { hashBlobId, hashPreparedFile } from '@/lib/mediaContentHash'
import { resolveUploadUri } from '@/lib/uploadUri'
import { generateImageThumbFile, thumbPathForBlob } from '@/lib/mediaThumb'

const INDEX_KEY = 'wa-message-media-v2'
const LEGACY_INDEX_KEY = 'wa-message-media-v1'
const UPLOAD_HASH_INDEX_KEY = 'wa-media-hash-to-s3-v1'
const MEDIA_DIR = `${FileSystem.documentDirectory ?? ''}wa-media/`
/** Legacy path — treated as permanent (never evicted). */
const BLOB_DIR = `${MEDIA_DIR}blobs/`
/** Active conversations (recent activity) — never evicted. */
const PERMANENT_DIR = `${MEDIA_DIR}permanent/`
/** Older conversations — LRU-evictable archive. */
const ARCHIVE_DIR = `${MEDIA_DIR}archive/`

/** LRU budget for archive-tier blobs only. */
const ARCHIVE_CACHE_BUDGET_BYTES = 500 * 1024 * 1024
/** Conversations with activity within this window store media in permanent/. */
const ACTIVE_CONVERSATION_MS = 30 * 24 * 60 * 60 * 1000
/** Delete leftover upload temp files older than this. */
const UPLOAD_TEMP_MAX_AGE_MS = 60 * 60 * 1000

export type BlobRecord = {
  localUri: string
  mimeType: string
  width?: number
  height?: number
  cachedAt: string
  /** JPEG preview for images (on-device, no server thumb). */
  thumbUri?: string
}

type MediaIndexV2 = {
  messageToBlob: Record<string, string>
  blobs: Record<string, BlobRecord>
}

let indexMem: MediaIndexV2 | null = null
let indexLoad: Promise<MediaIndexV2> | null = null
let reconcilePromise: Promise<void> | null = null
const validatedBlobs = new Set<string>()
const messageCacheListeners = new Map<string, Set<() => void>>()
let uploadHashMem: Record<string, string> | null = null

function notifyMessageCacheListeners(messageIds: Iterable<string>) {
  for (const messageId of messageIds) {
    messageCacheListeners.get(messageId)?.forEach((listener) => listener())
  }
}

function notifyAllMessageCacheListeners() {
  messageCacheListeners.forEach((listeners) => {
    listeners.forEach((listener) => listener())
  })
}

/** Subscribe to cache updates for one message (avoids rebroadcasting to the whole chat list). */
export function subscribeMessageMediaCache(
  messageId: string | undefined,
  listener: () => void,
): () => void {
  if (!messageId) return () => undefined
  let listeners = messageCacheListeners.get(messageId)
  if (!listeners) {
    listeners = new Set()
    messageCacheListeners.set(messageId, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners!.delete(listener)
    if (listeners!.size === 0) messageCacheListeners.delete(messageId)
  }
}

function emptyIndex(): MediaIndexV2 {
  return { messageToBlob: {}, blobs: {} }
}

function blobPath(dir: string, blobId: string, ext: string) {
  const safe = blobId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return `${dir}${safe}${ext}`
}

function isArchiveUri(uri: string): boolean {
  return uri.includes('/archive/')
}

async function storageDirForConversation(conversationId: string): Promise<string> {
  try {
    const { ensureDbReady, getRawDb } = await import('@/lib/db/client')
    await ensureDbReady()
    const row = await getRawDb().getFirstAsync<{ last_message_at: string | null }>(
      'SELECT last_message_at FROM conversations WHERE id = ?',
      [conversationId],
    )
    const lastAt = row?.last_message_at ? Date.parse(row.last_message_at) : Date.now()
    if (Date.now() - lastAt < ACTIVE_CONVERSATION_MS) return PERMANENT_DIR
  } catch {
    // Default to permanent when conversation metadata is unavailable.
  }
  return ARCHIVE_DIR
}

async function loadIndex(): Promise<MediaIndexV2> {
  if (indexMem) return indexMem
  if (!indexLoad) {
    indexLoad = (async () => {
      const raw = await appStorage.getItem(INDEX_KEY)
      if (raw) {
        try {
          indexMem = JSON.parse(raw) as MediaIndexV2
          return indexMem
        } catch {
          indexMem = emptyIndex()
        }
      } else {
        indexMem = await migrateLegacyIndex()
      }
      return indexMem
    })()
  }
  indexMem = await indexLoad
  return indexMem
}

async function migrateLegacyIndex(): Promise<MediaIndexV2> {
  const index = emptyIndex()
  const raw = await appStorage.getItem(LEGACY_INDEX_KEY)
  if (!raw) return index
  try {
    const legacy = JSON.parse(raw) as Record<
      string,
      BlobRecord & { messageId: string; conversationId: string }
    >
    for (const [messageId, entry] of Object.entries(legacy)) {
      const blobId = `legacy:${messageId}`
      index.blobs[blobId] = {
        localUri: entry.localUri,
        mimeType: entry.mimeType,
        width: entry.width,
        height: entry.height,
        cachedAt: entry.cachedAt,
      }
      index.messageToBlob[messageId] = blobId
    }
    await saveIndex(index)
  } catch {
    // ignore
  }
  return index
}

async function saveIndex(index: MediaIndexV2) {
  indexMem = index
  await appStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

async function loadUploadHashIndex(): Promise<Record<string, string>> {
  if (uploadHashMem) return uploadHashMem
  const raw = await appStorage.getItem(UPLOAD_HASH_INDEX_KEY)
  uploadHashMem = raw ? (JSON.parse(raw) as Record<string, string>) : {}
  return uploadHashMem
}

async function saveUploadHashIndex(map: Record<string, string>) {
  uploadHashMem = map
  await appStorage.setItem(UPLOAD_HASH_INDEX_KEY, JSON.stringify(map))
}

async function reconcileStaleBlobs(index: MediaIndexV2) {
  const deadBlobIds = new Set<string>()
  let changed = false

  for (const [blobId, record] of Object.entries(index.blobs)) {
    if (await fileExists(record.localUri)) {
      validatedBlobs.add(blobId)
    } else {
      deadBlobIds.add(blobId)
      delete index.blobs[blobId]
      validatedBlobs.delete(blobId)
      changed = true
    }
  }

  const removedMessageIds: string[] = []
  if (deadBlobIds.size > 0) {
    for (const [messageId, blobId] of Object.entries(index.messageToBlob)) {
      if (deadBlobIds.has(blobId)) {
        delete index.messageToBlob[messageId]
        removedMessageIds.push(messageId)
        changed = true
      }
    }
  }

  if (changed) await saveIndex(index)
  if (removedMessageIds.length) {
    notifyMessageCacheListeners(removedMessageIds)
  }
}

export async function ensureMediaIndexLoaded(): Promise<MediaIndexV2> {
  const index = await loadIndex()
  if (!reconcilePromise) {
    reconcilePromise = reconcileStaleBlobs(index).then(async () => {
      await enforceMediaCacheBudget(index)
      if (indexMem) notifyMessageCacheListeners(Object.keys(indexMem.messageToBlob))
    })
  }
  await reconcilePromise
  return index
}

async function fileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0
  } catch {
    return 0
  }
}

/**
 * Bound archive-tier media growth: permanent + legacy blobs are never evicted.
 * When archive exceeds budget, evict oldest archive blobs from the index.
 */
export async function enforceMediaCacheBudget(index?: MediaIndexV2): Promise<void> {
  const idx = index ?? (await loadIndex())
  const entries = await Promise.all(
    Object.entries(idx.blobs)
      .filter(([, record]) => isArchiveUri(record.localUri))
      .map(async ([blobId, record]) => ({
        blobId,
        record,
        size: await fileSize(record.localUri),
        ts: Date.parse(record.cachedAt) || 0,
      })),
  )
  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= ARCHIVE_CACHE_BUDGET_BYTES) return

  const target = ARCHIVE_CACHE_BUDGET_BYTES * 0.9
  entries.sort((a, b) => a.ts - b.ts) // oldest first
  let changed = false
  const evictedMessageIds: string[] = []
  for (const entry of entries) {
    if (total <= target) break
    try {
      await FileSystem.deleteAsync(entry.record.localUri, { idempotent: true })
    } catch {
      // ignore
    }
    delete idx.blobs[entry.blobId]
    validatedBlobs.delete(entry.blobId)
    for (const [messageId, blobId] of Object.entries(idx.messageToBlob)) {
      if (blobId === entry.blobId) {
        delete idx.messageToBlob[messageId]
        evictedMessageIds.push(messageId)
      }
    }
    total -= entry.size
    changed = true
  }
  if (changed) {
    await saveIndex(idx)
    notifyMessageCacheListeners(evictedMessageIds)
  }
}

let budgetTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced budget enforcement after cache writes. Was: the budget was only
 * enforced at cold start, so the cache could grow unbounded within a session.
 */
export function scheduleMediaCacheBudgetCheck(): void {
  if (budgetTimer) return
  budgetTimer = setTimeout(() => {
    budgetTimer = null
    void enforceMediaCacheBudget().catch(() => {})
  }, 4000)
}

/** Approximate on-device media cache usage (blob files only). */
export async function getMediaCacheUsageBytes(): Promise<number> {
  const idx = await loadIndex()
  let total = 0
  for (const blob of Object.values(idx.blobs)) {
    try {
      const info = await FileSystem.getInfoAsync(blob.localUri)
      if (info.exists && typeof info.size === 'number') total += info.size
    } catch {
      // ignore missing files
    }
  }
  return total
}

/** Wipe all cached media + indexes (used on logout so the next agent starts clean). */
export async function clearMediaCache(): Promise<void> {
  if (budgetTimer) {
    clearTimeout(budgetTimer)
    budgetTimer = null
  }
  try {
    await FileSystem.deleteAsync(MEDIA_DIR, { idempotent: true })
  } catch {
    // ignore
  }
  indexMem = emptyIndex()
  indexLoad = null
  reconcilePromise = null
  uploadHashMem = null
  validatedBlobs.clear()
  await appStorage.removeItem(INDEX_KEY)
  await appStorage.removeItem(LEGACY_INDEX_KEY)
  await appStorage.removeItem(UPLOAD_HASH_INDEX_KEY)
  notifyAllMessageCacheListeners()
}

/** Delete stale upload temp files (wa-upload-*) left in the cache directory. */
export async function cleanupUploadTempFiles(): Promise<void> {
  const dir = FileSystem.cacheDirectory
  if (!dir) return
  try {
    const names = await FileSystem.readDirectoryAsync(dir)
    const now = Date.now()
    await Promise.all(
      names
        .filter((n) => n.startsWith('wa-upload-'))
        .map(async (n) => {
          // Filename embeds Date.now(); fall back to deleting if unparseable.
          const match = n.match(/wa-upload-(\d+)/)
          const ts = match ? Number(match[1]) : 0
          if (!ts || now - ts > UPLOAD_TEMP_MAX_AGE_MS) {
            try {
              await FileSystem.deleteAsync(`${dir}${n}`, { idempotent: true })
            } catch {
              // ignore
            }
          }
        }),
    )
  } catch {
    // ignore
  }
}

function getBlobUriSync(blobId: string): string | null {
  if (!indexMem) return null
  return indexMem.blobs[blobId]?.localUri ?? null
}

/** Instant lookup after index reconcile — skips stale paths missing on disk. */
export function getCachedMediaUriSync(messageId: string): string | null {
  if (!indexMem) return null
  const blobId = indexMem.messageToBlob[messageId]
  if (!blobId || !validatedBlobs.has(blobId)) return null
  return indexMem.blobs[blobId]?.localUri ?? null
}

/**
 * Message id first, then content-addressed S3 key — shows media already on disk
 * even when auto-download is off and this message was never aliased yet.
 */
export function resolveCachedMediaUriSync(
  messageId: string,
  s3Key?: string | null,
): string | null {
  const byMessage = getCachedMediaUriSync(messageId)
  if (byMessage) return byMessage
  if (s3Key?.startsWith('media/')) {
    const byKey = getCachedUriForS3KeySync(s3Key)
    if (byKey) return byKey
  }
  return null
}

export function resolveCachedMediaThumbUriSync(
  messageId: string,
  s3Key?: string | null,
): string | null {
  if (!indexMem) return null
  const blobId =
    indexMem.messageToBlob[messageId] ??
    (s3Key?.startsWith('media/') ? s3Key : null)
  if (!blobId || !validatedBlobs.has(blobId)) return null
  return indexMem.blobs[blobId]?.thumbUri ?? null
}

export function getCachedMediaThumbUriSync(messageId: string): string | null {
  if (!indexMem) return null
  const blobId = indexMem.messageToBlob[messageId]
  if (!blobId || !validatedBlobs.has(blobId)) return null
  return indexMem.blobs[blobId]?.thumbUri ?? null
}

/** Reuse an on-device file already fetched for the same S3 object. */
export function getCachedUriForS3KeySync(s3Key: string): string | null {
  return getBlobUriSync(s3Key)
}

export async function getS3KeyForContentHash(contentHash: string): Promise<string | null> {
  const map = await loadUploadHashIndex()
  return map[contentHash] ?? null
}

export async function rememberContentHashS3Key(
  contentHash: string,
  s3Key: string,
): Promise<void> {
  const map = await loadUploadHashIndex()
  if (map[contentHash] === s3Key) return
  map[contentHash] = s3Key
  await saveUploadHashIndex(map)
}

export async function ensureMediaDir() {
  if (!FileSystem.documentDirectory) return false
  try {
    await FileSystem.makeDirectoryAsync(BLOB_DIR, { intermediates: true })
    await FileSystem.makeDirectoryAsync(PERMANENT_DIR, { intermediates: true })
    await FileSystem.makeDirectoryAsync(ARCHIVE_DIR, { intermediates: true })
    return true
  } catch {
    return false
  }
}

function extForMime(mimeType: string, filename?: string | null): string {
  const fromName = filename?.includes('.') ? `.${filename.split('.').pop()}` : ''
  if (fromName && fromName.length <= 6) return fromName.toLowerCase()
  if (mimeType.startsWith('image/')) {
    if (mimeType.includes('png')) return '.png'
    if (mimeType.includes('webp')) return '.webp'
    if (mimeType.includes('gif')) return '.gif'
    return '.jpg'
  }
  if (mimeType.startsWith('video/')) return '.mp4'
  if (mimeType.startsWith('audio/')) return '.m4a'
  return '.bin'
}

async function probeImageSize(uri: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    )
  })
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return info.exists
  } catch {
    return false
  }
}

async function ensureBlobThumb(blobId: string, record: BlobRecord): Promise<BlobRecord> {
  if (record.thumbUri || !record.mimeType.startsWith('image/')) return record
  const dest = thumbPathForBlob(blobId)
  const thumbUri = await generateImageThumbFile(record.localUri, dest)
  if (!thumbUri) return record
  return { ...record, thumbUri }
}

async function linkMessageToBlob(
  messageId: string,
  blobId: string,
  record: BlobRecord,
): Promise<string> {
  const withThumb = await ensureBlobThumb(blobId, record)
  const index = await loadIndex()
  index.blobs[blobId] = withThumb
  index.messageToBlob[messageId] = blobId
  validatedBlobs.add(blobId)
  await saveIndex(index)
  notifyMessageCacheListeners([messageId])
  return withThumb.localUri
}

export async function getCachedMediaEntry(messageId: string) {
  const index = await loadIndex()
  const blobId = index.messageToBlob[messageId]
  if (!blobId) return null
  const record = index.blobs[blobId]
  if (!record) return null
  if (validatedBlobs.has(blobId)) return { messageId, blobId, ...record }
  if (await fileExists(record.localUri)) {
    validatedBlobs.add(blobId)
    return { messageId, blobId, ...record }
  }
  delete index.blobs[blobId]
  delete index.messageToBlob[messageId]
  validatedBlobs.delete(blobId)
  await saveIndex(index)
  notifyMessageCacheListeners([messageId])
  return null
}

export async function getCachedMediaUri(messageId: string): Promise<string | null> {
  const entry = await getCachedMediaEntry(messageId)
  return entry?.localUri ?? null
}

export async function getCachedMediaDimensions(messageId: string) {
  const entry = await getCachedMediaEntry(messageId)
  if (!entry?.width || !entry?.height) return null
  return { width: entry.width, height: entry.height }
}

export async function updateCachedMediaDimensions(
  messageId: string,
  width: number,
  height: number,
) {
  const index = await loadIndex()
  const blobId = index.messageToBlob[messageId]
  if (!blobId || !index.blobs[blobId]) return
  index.blobs[blobId] = { ...index.blobs[blobId], width, height }
  await saveIndex(index)
}

/** Keep the same on-device blob when an optimistic message id is replaced by the server id. */
export async function transferMessageMediaCache(
  fromMessageId: string,
  toMessageId: string,
): Promise<void> {
  if (!fromMessageId || !toMessageId || fromMessageId === toMessageId) return
  const index = await loadIndex()
  const blobId = index.messageToBlob[fromMessageId]
  if (!blobId || !index.blobs[blobId]) return
  index.messageToBlob[toMessageId] = blobId
  delete index.messageToBlob[fromMessageId]
  await saveIndex(index)
  notifyMessageCacheListeners([fromMessageId, toMessageId])
}

/** Point message at an existing blob (same S3 key / same file hash). */
export async function aliasMessageToBlob(
  messageId: string,
  blobId: string,
): Promise<string | null> {
  const index = await loadIndex()
  const record = index.blobs[blobId]
  if (!record) return null
  if (!(await fileExists(record.localUri))) return null
  index.messageToBlob[messageId] = blobId
  validatedBlobs.add(blobId)
  await saveIndex(index)
  notifyMessageCacheListeners([messageId])
  return record.localUri
}

/** Copy local picker/recording file into shared blob storage (deduped by content hash). */
export async function cacheMediaFromLocalFile(
  messageId: string,
  conversationId: string,
  localUri: string,
  mimeType: string,
  filename?: string | null,
  contentHash?: string | null,
): Promise<string | null> {
  const index = await loadIndex()
  const existingMsg = index.messageToBlob[messageId]
  if (existingMsg && index.blobs[existingMsg]) {
    return index.blobs[existingMsg].localUri
  }

  const blobId = contentHash ? hashBlobId(contentHash) : null
  if (blobId && index.blobs[blobId]) {
    return aliasMessageToBlob(messageId, blobId)
  }

  if (!(await ensureMediaDir())) return null

  const source = resolveUploadUri(localUri)
  if (!(await fileExists(source))) return null

  const ext = extForMime(mimeType, filename)
  const id = blobId ?? `local:${messageId}`
  const dir = await storageDirForConversation(conversationId)
  const dest = blobPath(dir, id, ext)

  if (!index.blobs[id]) {
    try {
      await FileSystem.copyAsync({ from: source, to: dest })
    } catch {
      return null
    }
  }

  const dims = mimeType.startsWith('image/') ? await probeImageSize(dest) : null

  return linkMessageToBlob(messageId, id, {
    localUri: dest,
    mimeType,
    width: dims?.width,
    height: dims?.height,
    cachedAt: new Date().toISOString(),
  })
}

/** Download S3 media once per key; further messages with the same mediaUrl reuse the file. */
export async function cacheMediaFromRemoteUrl(
  messageId: string,
  conversationId: string,
  downloadUrl: string,
  mimeType: string,
  filename?: string | null,
  s3Key?: string | null,
  dimensions?: { width: number; height: number },
): Promise<string | null> {
  const index = await loadIndex()
  const blobId = s3Key && s3Key.startsWith('media/') ? s3Key : null

  if (blobId && index.blobs[blobId]) {
    const uri = await aliasMessageToBlob(messageId, blobId)
    if (uri) return uri
    delete index.blobs[blobId]
    validatedBlobs.delete(blobId)
  }

  const existingMsg = index.messageToBlob[messageId]
  if (existingMsg && index.blobs[existingMsg]) {
    const existingUri = index.blobs[existingMsg].localUri
    if (await fileExists(existingUri)) return existingUri
    delete index.blobs[existingMsg]
    delete index.messageToBlob[messageId]
    validatedBlobs.delete(existingMsg)
  }

  if (!(await ensureMediaDir())) return null

  const ext = extForMime(mimeType, filename)
  const id = blobId ?? `remote:${messageId}`
  const dir = await storageDirForConversation(conversationId)
  const dest = blobPath(dir, id, ext)

  if (!index.blobs[id]) {
    try {
      const result = await FileSystem.downloadAsync(downloadUrl, dest)
      if (result.status < 200 || result.status >= 300) return null
    } catch {
      return null
    }
  }

  const dims =
    dimensions ?? (mimeType.startsWith('image/') ? await probeImageSize(dest) : null)

  const record: BlobRecord = {
    localUri: dest,
    mimeType,
    width: dims?.width,
    height: dims?.height,
    cachedAt: new Date().toISOString(),
  }

  const uri = await linkMessageToBlob(messageId, id, record)

  // Dedup alias by content hash — deferred so chat scroll is not blocked on large files.
  void registerInboundContentHashAlias(dest, id, record)

  // Keep on-device media within budget as the cache grows during a session.
  scheduleMediaCacheBudgetCheck()

  return uri
}

async function registerInboundContentHashAlias(
  dest: string,
  blobId: string,
  record: BlobRecord,
): Promise<void> {
  const contentHash = await hashPreparedFile(dest)
  if (!contentHash) return

  const hashId = hashBlobId(contentHash)
  if (hashId === blobId) return

  const fresh = await loadIndex()
  if (fresh.blobs[hashId]) {
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true })
    } catch {
      /* ignore */
    }
    return
  }

  fresh.blobs[hashId] = fresh.blobs[blobId] ?? record
  await saveIndex(fresh)
}
