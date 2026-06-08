import { eq } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { messages } from '../db/schema.js'
import { whatsapp } from './whatsapp.js'
import type { S3Service } from './s3.js'
import { contentAddressedKeyParts } from '../utils/content-addressed-key.js'
import { normalizeWhatsAppMime } from '../utils/mime-normalize.js'
import { registerBlob } from './media-blobs.js'
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

  const url = await whatsapp.getMediaUrl(log, payload.waMediaId)
  const buffer = await whatsapp.downloadMedia(log, url)

  const filename = deriveFilename(payload.filename, payload.mimeType, payload.messageId)
  const mimeType = normalizeWhatsAppMime(payload.mimeType, filename)
  const { sha256, key } = contentAddressedKeyParts(buffer, filename, mimeType)

  await s3.uploadToS3IfMissing(key, buffer, mimeType)
  await registerBlob({ sha256, storageKey: key, mimeType, sizeBytes: buffer.length })
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
