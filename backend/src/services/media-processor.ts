import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { messages } from '../db/schema.js'
import { whatsapp } from './whatsapp.js'
import type { S3Service } from './s3.js'
import { contentAddressedKeyParts } from '../utils/content-addressed-key.js'
import { normalizeWhatsAppMime } from '../utils/mime-normalize.js'
import {
  registerBlob,
  getBlobBySha256,
  getBlobByStorageKey,
  getBlobByWaMediaId,
  recordWaMediaId,
  type MediaBlob,
} from './media-blobs.js'
import { emitMediaReady } from './socket-events.js'
import { enrichImageMediaMeta } from '../utils/image-thumb.js'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
}

function deriveFilename(filename: string, mimeType: string, messageId: string): string {
  if (filename && filename !== 'upload') return filename
  const ext = EXT_BY_MIME[mimeType] ?? 'bin'
  return `${messageId}.${ext}`
}

function isMeaningfulDocumentName(filename: string, messageId: string): boolean {
  if (!filename || filename === 'upload') return false
  return !filename.startsWith(`${messageId}.`)
}

async function assignMessageToExistingBlob(
  payload: { messageId: string; conversationId: string; waMediaId: string },
  blob: Pick<MediaBlob, 'storageKey' | 'mimeType' | 'sizeBytes' | 'sha256'>,
  log: FastifyBaseLogger,
  io: SocketIOServer,
  reason: string,
): Promise<void> {
  log.info(
    { messageId: payload.messageId, waMediaId: payload.waMediaId, key: blob.storageKey, reason },
    'inbound media reused',
  )
  await db
    .update(messages)
    .set({
      mediaUrl: blob.storageKey,
      mediaMimeType: blob.mimeType,
      mediaFileSize: blob.sizeBytes,
      mediaStatus: 'uploaded',
    })
    .where(eq(messages.id, payload.messageId))
  await recordWaMediaId(blob.sha256, payload.waMediaId)
  emitMediaReady(io, payload.conversationId, payload.messageId, blob.storageKey)
}

/** Documents resent with the same name + byte size when WhatsApp hash differs. */
async function findDocumentStorageKey(
  filename: string,
  mimeType: string,
  fileSizeBytes: number,
): Promise<string | null> {
  const row = await db.query.messages.findFirst({
    where: and(
      eq(messages.mediaFilename, filename),
      eq(messages.mediaFileSize, fileSizeBytes),
      eq(messages.mediaMimeType, mimeType),
      eq(messages.mediaStatus, 'uploaded'),
      isNotNull(messages.mediaUrl),
    ),
    columns: { mediaUrl: true },
    orderBy: desc(messages.sentAt),
  })
  return row?.mediaUrl ?? null
}

/**
 * Single-hop inbound media pipeline (no base64 in the jobs table):
 *   WhatsApp media id -> download URL -> bytes -> S3 -> mark uploaded -> emit.
 */
export async function processDownloadMedia(
  s3: S3Service,
  io: SocketIOServer,
  log: FastifyBaseLogger,
  payload: {
    messageId: string
    conversationId: string
    waMediaId: string
    mimeType: string
    filename: string
    waContentSha256?: string
    waFileSizeBytes?: number
  },
): Promise<void> {
  const existing = await db.query.messages.findFirst({
    where: eq(messages.id, payload.messageId),
    columns: { mediaUrl: true, mediaStatus: true },
  })
  if (existing?.mediaStatus === 'uploaded' && existing.mediaUrl) {
    log.info({ messageId: payload.messageId, key: existing.mediaUrl }, 'inbound media already uploaded')
    emitMediaReady(io, payload.conversationId, payload.messageId, existing.mediaUrl)
    return
  }

  const knownBlob = await getBlobByWaMediaId(payload.waMediaId)
  if (knownBlob) {
    await assignMessageToExistingBlob(payload, knownBlob, log, io, 'wa_media_id')
    return
  }

  if (payload.waContentSha256) {
    const byHash = await getBlobBySha256(payload.waContentSha256)
    if (byHash) {
      await assignMessageToExistingBlob(payload, byHash, log, io, 'webhook_sha256')
      return
    }
  }

  const mediaInfo = await whatsapp.getMediaInfo(log, payload.waMediaId)

  if (mediaInfo.sha256) {
    const byHash = await getBlobBySha256(mediaInfo.sha256)
    if (byHash) {
      await assignMessageToExistingBlob(payload, byHash, log, io, 'media_api_sha256')
      return
    }
  }

  const fileSize = payload.waFileSizeBytes ?? mediaInfo.fileSize
  const mimeType = normalizeWhatsAppMime(
    mediaInfo.mimeType ?? payload.mimeType,
    payload.filename,
  )
  if (
    mimeType.startsWith('application/') &&
    fileSize &&
    isMeaningfulDocumentName(payload.filename, payload.messageId)
  ) {
    const docKey = await findDocumentStorageKey(payload.filename, mimeType, fileSize)
    if (docKey) {
      const blob = await getBlobByStorageKey(docKey)
      if (blob) {
        await assignMessageToExistingBlob(payload, blob, log, io, 'document_name_size')
        return
      }
      await db
        .update(messages)
        .set({
          mediaUrl: docKey,
          mediaMimeType: mimeType,
          mediaFileSize: fileSize,
          mediaFilename: payload.filename,
          mediaStatus: 'uploaded',
        })
        .where(eq(messages.id, payload.messageId))
      log.info(
        { messageId: payload.messageId, key: docKey },
        'inbound document reused by filename+size',
      )
      emitMediaReady(io, payload.conversationId, payload.messageId, docKey)
      return
    }
  }

  const buffer = await whatsapp.downloadMedia(log, mediaInfo.url)

  const filename = deriveFilename(payload.filename, mimeType, payload.messageId)
  const { sha256, key } = contentAddressedKeyParts(buffer, filename, mimeType)

  await s3.uploadToS3IfMissing(key, buffer, mimeType)
  await registerBlob({ sha256, storageKey: key, mimeType, sizeBytes: buffer.length })
  await recordWaMediaId(sha256, payload.waMediaId)
  const meta = await enrichImageMediaMeta(s3, buffer, mimeType, filename)

  await db
    .update(messages)
    .set({
      mediaUrl: key,
      mediaThumbUrl: meta.mediaThumbUrl,
      mediaFileSize: meta.mediaFileSize,
      mediaMimeType: mimeType,
      mediaFilename: filename,
      mediaStatus: 'uploaded',
    })
    .where(eq(messages.id, payload.messageId))

  emitMediaReady(io, payload.conversationId, payload.messageId, key)
}
