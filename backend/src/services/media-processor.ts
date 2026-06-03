import { eq } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { messages } from '../db/schema.js'
import { whatsapp } from './whatsapp.js'
import { buildMediaKey, type S3Service } from './s3.js'
import { emitMediaReady } from './socket-events.js'

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
  const url = await whatsapp.getMediaUrl(log, payload.waMediaId)
  const buffer = await whatsapp.downloadMedia(log, url)

  const filename = deriveFilename(payload.filename, payload.mimeType, payload.messageId)
  const key = buildMediaKey(payload.conversationId, payload.messageId, filename)

  await s3.uploadToS3(key, buffer, payload.mimeType)

  await db
    .update(messages)
    .set({
      mediaUrl: key,
      mediaMimeType: payload.mimeType,
      mediaFilename: filename,
      mediaStatus: 'uploaded',
    })
    .where(eq(messages.id, payload.messageId))

  emitMediaReady(io, payload.conversationId, payload.messageId, key)
}
