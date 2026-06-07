import type { FastifyInstance } from 'fastify'
import { createOutboundMedia } from './outbound.js'
import { whatsapp } from './whatsapp.js'
import { prepareOutboundMedia } from '../utils/prepare-outbound-media.js'
import { validateImageForWhatsApp } from '../utils/prepare-image.js'
import { prepareDocumentForWhatsApp } from '../utils/prepare-document.js'
import { contentAddressedKey } from '../utils/content-addressed-key.js'
import {
  mediaKindFromMime,
  useOutboundFastPath,
  type WaMediaKind,
} from '../utils/wa-media-limits.js'
import {
  mediaTypeFromStoredMime,
  voiceNoteFromMime,
  waMimeFromStored,
} from '../utils/stored-media.js'

async function persistAndMaybeUploadWa(
  app: FastifyInstance,
  opts: {
    buffer: Buffer
    mime: string
    filename: string
    type: WaMediaKind
    sourceBytes: number
  },
): Promise<{ s3Key: string; s3DedupHit: boolean; mediaId?: string; path: 'fast' | 'deferred'; waUploadMs?: number }> {
  const started = Date.now()
  const s3Key = contentAddressedKey(opts.buffer, opts.filename, opts.mime)
  const existed = await app.s3.objectExists(s3Key)
  const fast = useOutboundFastPath(opts.type, opts.buffer.length)

  if (fast) {
    const waStart = Date.now()
    const [, uploaded] = await Promise.all([
      app.s3.uploadToS3IfMissing(s3Key, opts.buffer, opts.mime),
      whatsapp.uploadMedia(app.log, opts.buffer, opts.mime, opts.filename),
    ])
    const waUploadMs = Date.now() - waStart
    app.log.info(
      {
        path: 'fast',
        type: opts.type,
        sourceBytes: opts.sourceBytes,
        preparedBytes: opts.buffer.length,
        s3DedupHit: existed,
        waUploadMs,
        totalMs: Date.now() - started,
      },
      'outbound_media_prepared',
    )
    return { s3Key, s3DedupHit: existed, mediaId: uploaded.id, path: 'fast', waUploadMs }
  }

  await app.s3.uploadToS3IfMissing(s3Key, opts.buffer, opts.mime)
  app.log.info(
    {
      path: 'deferred',
      type: opts.type,
      sourceBytes: opts.sourceBytes,
      preparedBytes: opts.buffer.length,
      s3DedupHit: existed,
      totalMs: Date.now() - started,
    },
    'outbound_media_prepared',
  )
  return { s3Key, s3DedupHit: existed, path: 'deferred' }
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
    log: app.log,
  })
  const { buffer, mime, filename, voiceNote, mediaKind: type, sourceBytes } = prepared

  const persisted = await persistAndMaybeUploadWa(app, {
    buffer,
    mime,
    filename,
    type,
    sourceBytes,
  })

  return createOutboundMedia(app.io, {
    conversationId: opts.conversationId,
    to: opts.contactWaId,
    type,
    ...(persisted.mediaId ? { mediaId: persisted.mediaId } : { s3Key: persisted.s3Key }),
    s3Key: persisted.s3Key,
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
    /** Re-upload stored S3 bytes without re-processing (forward / resend / reuse). */
    passthrough?: boolean
  },
) {
  if (!opts.s3Key.startsWith('media/')) {
    throw new Error('Invalid media key')
  }

  const buffer = await app.s3.downloadFromS3(opts.s3Key)

  if (opts.passthrough) {
    if (opts.mimeType.startsWith('image/')) {
      const kind = mediaKindFromMime(opts.mimeType) === 'sticker' ? 'sticker' : 'image'
      const validated = await validateImageForWhatsApp(
        buffer,
        opts.filename,
        opts.mimeType,
        { kind },
      )
      const persisted = await persistAndMaybeUploadWa(app, {
        buffer: validated.buffer,
        mime: validated.mime,
        filename: validated.filename,
        type: kind,
        sourceBytes: buffer.length,
      })
      return createOutboundMedia(app.io, {
        conversationId: opts.conversationId,
        to: opts.contactWaId,
        type: kind,
        ...(persisted.mediaId ? { mediaId: persisted.mediaId } : { s3Key: opts.s3Key }),
        s3Key: opts.s3Key,
        mimeType: validated.mime,
        filename: validated.filename,
        caption: opts.caption,
        sentBy: opts.sentBy,
        voiceNote: false,
        replyToMessageId: opts.replyToMessageId,
        replyToWaMessageId: opts.replyToWaMessageId,
      })
    }

    if (opts.mimeType.startsWith('document/') || mediaKindFromMime(opts.mimeType) === 'document') {
      const validated = await prepareDocumentForWhatsApp(
        buffer,
        opts.filename,
        opts.mimeType,
      )
      const persisted = await persistAndMaybeUploadWa(app, {
        buffer: validated.buffer,
        mime: validated.mime,
        filename: validated.filename,
        type: 'document',
        sourceBytes: buffer.length,
      })
      return createOutboundMedia(app.io, {
        conversationId: opts.conversationId,
        to: opts.contactWaId,
        type: 'document',
        ...(persisted.mediaId ? { mediaId: persisted.mediaId } : { s3Key: opts.s3Key }),
        s3Key: opts.s3Key,
        mimeType: validated.mime,
        filename: validated.filename,
        caption: opts.caption,
        sentBy: opts.sentBy,
        voiceNote: false,
        replyToMessageId: opts.replyToMessageId,
        replyToWaMessageId: opts.replyToWaMessageId,
      })
    }

    const type = mediaTypeFromStoredMime(opts.mimeType)
    const mime = waMimeFromStored(opts.mimeType)
    const kind = mediaKindFromMime(mime)
    const persisted = await persistAndMaybeUploadWa(app, {
      buffer,
      mime,
      filename: opts.filename,
      type: kind,
      sourceBytes: buffer.length,
    })
    return createOutboundMedia(app.io, {
      conversationId: opts.conversationId,
      to: opts.contactWaId,
      type,
      ...(persisted.mediaId ? { mediaId: persisted.mediaId } : { s3Key: opts.s3Key }),
      s3Key: opts.s3Key,
      mimeType: mime,
      filename: opts.filename,
      caption: opts.caption,
      sentBy: opts.sentBy,
      voiceNote: type === 'audio' && voiceNoteFromMime(opts.mimeType),
      replyToMessageId: opts.replyToMessageId,
      replyToWaMessageId: opts.replyToWaMessageId,
    })
  }

  const prepared = await prepareOutboundMedia(buffer, opts.filename, opts.mimeType, {
    log: app.log,
  })
  const { buffer: outBuf, mime, filename, voiceNote, mediaKind: type, sourceBytes } = prepared

  const persisted = await persistAndMaybeUploadWa(app, {
    buffer: outBuf,
    mime,
    filename,
    type,
    sourceBytes,
  })

  return createOutboundMedia(app.io, {
    conversationId: opts.conversationId,
    to: opts.contactWaId,
    type,
    ...(persisted.mediaId ? { mediaId: persisted.mediaId } : { s3Key: opts.s3Key }),
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

