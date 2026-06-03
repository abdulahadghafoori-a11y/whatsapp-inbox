import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { messages } from '../db/schema.js'
import type { S3Service } from '../services/s3.js'

/** What WhatsApp delivers for customer voice notes (from our DB). */
export interface InboundAudioProfile {
  mimeType: string
  uploadMime: string
  filename: string
  bytes: number
  magic: string
  isOggOpus: boolean
}

export function analyzeAudioBuffer(buffer: Buffer): {
  magic: string
  isOggOpus: boolean
  isAmr: boolean
  isMp4: boolean
} {
  const magic = buffer.subarray(0, 4).toString('ascii')
  return {
    magic,
    isOggOpus: magic === 'OggS',
    isAmr: buffer.subarray(0, 5).toString('ascii') === '#!AMR',
    isMp4: buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp',
  }
}

/** Load a real customer voice note from this chat to match format. */
export async function loadInboundAudioProfile(
  conversationId: string,
  s3: S3Service,
): Promise<InboundAudioProfile | null> {
  const row = await db.query.messages.findFirst({
    where: and(
      eq(messages.conversationId, conversationId),
      eq(messages.type, 'audio'),
      eq(messages.direction, 'inbound'),
      eq(messages.mediaStatus, 'uploaded'),
    ),
    orderBy: [desc(messages.sentAt)],
    columns: { mediaUrl: true, mediaMimeType: true, mediaFilename: true },
  })
  if (!row?.mediaUrl) return null

  const buffer = await s3.downloadFromS3(row.mediaUrl)
  const mimeType = row.mediaMimeType ?? 'audio/ogg'
  const analysis = analyzeAudioBuffer(buffer)

  return {
    mimeType,
    uploadMime:
      mimeType.toLowerCase().includes('opus') || mimeType.toLowerCase().includes('ogg')
        ? mimeType
        : 'audio/ogg; codecs=opus',
    filename: row.mediaFilename ?? 'audio.ogg',
    bytes: buffer.length,
    magic: analysis.magic,
    isOggOpus: analysis.isOggOpus,
  }
}
