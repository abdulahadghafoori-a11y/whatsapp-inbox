import * as FileSystem from 'expo-file-system/legacy'
import { Image as RNImage } from 'react-native'
import { appStorage } from '@/lib/appStorage'
import { hashBlobId } from '@/lib/mediaContentHash'
import { resolveUploadUri } from '@/lib/uploadUri'

const INDEX_KEY = 'wa-message-media-v2'
const LEGACY_INDEX_KEY = 'wa-message-media-v1'
const UPLOAD_HASH_INDEX_KEY = 'wa-media-hash-to-s3-v1'
const MEDIA_DIR = `${FileSystem.documentDirectory ?? ''}wa-media/`
const BLOB_DIR = `${MEDIA_DIR}blobs/`

export type BlobRecord = {
  localUri: string
  mimeType: string
  width?: number
  height?: number
  cachedAt: string
}

type MediaIndexV2 = {
  messageToBlob: Record<string, string>
  blobs: Record<string, BlobRecord>
}

let indexMem: MediaIndexV2 | null = null
let indexLoad: Promise<MediaIndexV2> | null = null
let reconcilePromise: Promise<void> | null = null
const validatedBlobs = new Set<string>()
const cacheListeners = new Set<() => void>()
let uploadHashMem: Record<string, string> | null = null

function notifyCacheListeners() {
  cacheListeners.forEach((l) => l())
}

export function subscribeMediaCache(listener: () => void): () => void {
  cacheListeners.add(listener)
  return () => {
    cacheListeners.delete(listener)
  }
}

function emptyIndex(): MediaIndexV2 {
  return { messageToBlob: {}, blobs: {} }
}

function blobPath(blobId: string, ext: string) {
  const safe = blobId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return `${BLOB_DIR}${safe}${ext}`
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

  if (deadBlobIds.size > 0) {
    for (const [messageId, blobId] of Object.entries(index.messageToBlob)) {
      if (deadBlobIds.has(blobId)) {
        delete index.messageToBlob[messageId]
        changed = true
      }
    }
  }

  if (changed) await saveIndex(index)
}

export async function ensureMediaIndexLoaded(): Promise<MediaIndexV2> {
  const index = await loadIndex()
  if (!reconcilePromise) {
    reconcilePromise = reconcileStaleBlobs(index)
  }
  await reconcilePromise
  return index
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

async function linkMessageToBlob(
  messageId: string,
  blobId: string,
  record: BlobRecord,
): Promise<string> {
  const index = await loadIndex()
  index.blobs[blobId] = record
  index.messageToBlob[messageId] = blobId
  validatedBlobs.add(blobId)
  await saveIndex(index)
  notifyCacheListeners()
  return record.localUri
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
  notifyCacheListeners()
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
  notifyCacheListeners()
  return record.localUri
}

/** Copy local picker/recording file into shared blob storage (deduped by content hash). */
export async function cacheMediaFromLocalFile(
  messageId: string,
  _conversationId: string,
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
  const dest = blobPath(id, ext)

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
  _conversationId: string,
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
  const dest = blobPath(id, ext)

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

  return linkMessageToBlob(messageId, id, {
    localUri: dest,
    mimeType,
    width: dims?.width,
    height: dims?.height,
    cachedAt: new Date().toISOString(),
  })
}
