import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { createOutboundMedia } from './outbound.js'
import { whatsapp } from './whatsapp.js'
import { prepareOutboundMedia } from '../utils/prepare-outbound-media.js'

function extFromFilename(filename: string, mime: string): string {
  if (filename.includes('.')) {
    const ext = filename.slice(filename.lastIndexOf('.'))
    if (ext.length <= 6) return ext.toLowerCase()
  }
  if (mime.startsWith('image/')) {
    if (mime.includes('png')) return '.png'
    if (mime.includes('webp')) return '.webp'
    return '.jpg'
  }
  if (mime.startsWith('video/')) return '.mp4'
  if (mime.startsWith('audio/')) return '.m4a'
  return '.bin'
}

function contentAddressedKey(buffer: Buffer, filename: string, mime: string): string {
  const hash = createHash('sha256').update(buffer).digest('hex')
  return `media/blobs/${hash}${extFromFilename(filename, mime)}`
}

export async function sendOutboundMediaBuffer(
  app: FastifyInstance,
  opts: {
    conversationId: string
    contactWaId: string
    buffer: Buffer
    filename: string
    mimeHint: string
    caption?: string
    sentBy: string
    replyToMessageId?: string
    replyToWaMessageId?: string
  },
) {
  const prepared = await prepareOutboundMedia(opts.buffer, opts.filename, opts.mimeHint, {
    conversationId: opts.conversationId,
    s3: app.s3,
    log: app.log,
  })
  const { buffer, mime, filename, voiceNote, mediaKind: type } = prepared

  const s3Key = contentAddressedKey(buffer, filename, mime)
  const existed = await app.s3.objectExists(s3Key)
  await app.s3.uploadToS3IfMissing(s3Key, buffer, mime)
  if (existed) {
    app.log.debug({ s3Key }, 's3_media_dedup_hit')
  }

  const uploaded = await whatsapp.uploadMedia(app.log, buffer, mime, filename)

  return createOutboundMedia(app.io, {
    conversationId: opts.conversationId,
    to: opts.contactWaId,
    type,
    mediaId: uploaded.id,
    s3Key,
    mimeType: mime,
    filename,
    caption: opts.caption,
    sentBy: opts.sentBy,
    voiceNote,
    replyToMessageId: opts.replyToMessageId,
    replyToWaMessageId: opts.replyToWaMessageId,
  })
}

/** Send media that is already on S3 (skip re-uploading bytes from the client). */
export async function sendOutboundMediaFromS3Key(
  app: FastifyInstance,
  opts: {
    conversationId: string
    contactWaId: string
    s3Key: string
    filename: string
    mimeType: string
    caption?: string
    sentBy: string
    replyToMessageId?: string
    replyToWaMessageId?: string
  },
) {
  if (!opts.s3Key.startsWith('media/')) {
    throw new Error('Invalid media key')
  }

  const buffer = await app.s3.downloadFromS3(opts.s3Key)
  const prepared = await prepareOutboundMedia(
    buffer,
    opts.filename,
    opts.mimeType,
    {
      conversationId: opts.conversationId,
      s3: app.s3,
      log: app.log,
    },
  )
  const { buffer: outBuf, mime, filename, voiceNote, mediaKind: type } = prepared

  const uploaded = await whatsapp.uploadMedia(app.log, outBuf, mime, filename)

  return createOutboundMedia(app.io, {
    conversationId: opts.conversationId,
    to: opts.contactWaId,
    type,
    mediaId: uploaded.id,
    s3Key: opts.s3Key,
    mimeType: mime,
    filename,
    caption: opts.caption,
    sentBy: opts.sentBy,
    voiceNote,
    replyToMessageId: opts.replyToMessageId,
    replyToWaMessageId: opts.replyToWaMessageId,
  })
}
