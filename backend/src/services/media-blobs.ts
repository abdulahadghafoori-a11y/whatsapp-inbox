import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mediaBlobs, type MediaBlob } from '../db/schema.js'

/**
 * WhatsApp media handles stay valid ~30 days; reuse well inside that window so a
 * stale handle never causes a permanent send failure.
 */
const WA_MEDIA_REUSE_MAX_AGE_MS = 20 * 24 * 60 * 60 * 1000

export interface RegisterBlobInput {
  sha256: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  durationMs?: number | null
}

/** Upsert the content-addressed registry row for a stored object. Idempotent. */
export async function registerBlob(input: RegisterBlobInput): Promise<void> {
  await db
    .insert(mediaBlobs)
    .values({
      sha256: input.sha256,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: mediaBlobs.sha256,
      set: {
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        updatedAt: new Date(),
      },
    })
}

export async function getBlobBySha256(sha256: string): Promise<MediaBlob | undefined> {
  return db.query.mediaBlobs.findFirst({ where: eq(mediaBlobs.sha256, sha256) })
}

export async function getBlobByStorageKey(storageKey: string): Promise<MediaBlob | undefined> {
  return db.query.mediaBlobs.findFirst({ where: eq(mediaBlobs.storageKey, storageKey) })
}

/** Returns a still-fresh WhatsApp media handle for these bytes, or null. */
export async function getReusableWaMediaId(sha256: string): Promise<string | null> {
  const row = await db.query.mediaBlobs.findFirst({
    where: eq(mediaBlobs.sha256, sha256),
    columns: { waMediaId: true, waMediaUploadedAt: true },
  })
  if (!row?.waMediaId || !row.waMediaUploadedAt) return null
  if (Date.now() - row.waMediaUploadedAt.getTime() > WA_MEDIA_REUSE_MAX_AGE_MS) return null
  return row.waMediaId
}

/** Record the WhatsApp media handle returned by an upload so later sends reuse it. */
export async function recordWaMediaId(sha256: string, waMediaId: string): Promise<void> {
  await db
    .update(mediaBlobs)
    .set({ waMediaId, waMediaUploadedAt: new Date(), updatedAt: new Date() })
    .where(eq(mediaBlobs.sha256, sha256))
}

/** Persist the client-generated ThumbHash + intrinsic dimensions for a blob (Phase 3). */
export async function setBlobThumbhash(
  sha256: string,
  input: { thumbhash: string; width?: number | null; height?: number | null },
): Promise<void> {
  await db
    .update(mediaBlobs)
    .set({
      thumbhash: input.thumbhash,
      ...(input.width != null ? { width: input.width } : {}),
      ...(input.height != null ? { height: input.height } : {}),
      updatedAt: new Date(),
    })
    .where(eq(mediaBlobs.sha256, sha256))
}
