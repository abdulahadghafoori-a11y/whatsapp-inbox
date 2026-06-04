import type { FastifyBaseLogger } from 'fastify'
import type { S3Service } from '../services/s3.js'
import { errors } from './errors.js'
import { normalizeWhatsAppMime } from './mime-normalize.js'
import { prepareAudioForWhatsApp } from './transcode-audio.js'
import { prepareImageForWhatsApp } from './prepare-image.js'
import { prepareVideoForWhatsApp } from './prepare-video.js'
import { prepareDocumentForWhatsApp } from './prepare-document.js'
import { analyzeAudioBuffer } from './inbound-audio-profile.js'
import {
  capForMime,
  mediaKindFromMime,
  type WaMediaKind,
} from './wa-media-limits.js'

export type PreparedOutboundMedia = {
  buffer: Buffer
  mime: string
  filename: string
  voiceNote: boolean
  mediaKind: WaMediaKind
  sourceBytes: number
}

type PrepareOpts = {
  conversationId?: string
  s3?: S3Service
  log?: FastifyBaseLogger
}

/**
 * Single entry point: normalize, transcode/compress, and enforce WhatsApp limits
 * for every outbound media type (image, video, audio, document, sticker).
 */
export async function prepareOutboundMedia(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
  opts: PrepareOpts = {},
): Promise<PreparedOutboundMedia> {
  const sourceBytes = buffer.length
  let mime = normalizeWhatsAppMime(mimeHint, filename)
  let outBuffer = buffer
  let outName = filename
  let voiceNote = false

  if (mime.startsWith('audio/')) {
    const prepared = await prepareAudioForWhatsApp(buffer, filename, {
      conversationId: opts.conversationId,
      s3: opts.s3,
      log: opts.log,
    })
    outBuffer = prepared.buffer
    mime = prepared.mime.split(';')[0].trim()
    outName = prepared.filename
    voiceNote = prepared.voiceNote
    const analysis = analyzeAudioBuffer(outBuffer)
    opts.log?.info(
      {
        mime,
        bytes: outBuffer.length,
        filename: outName,
        voiceNote,
        outputMagic: analysis.magic,
        sourceBytes,
      },
      'outbound_audio_prepared',
    )
  } else if (mime.startsWith('image/')) {
    const kind = mediaKindFromMime(mime) === 'sticker' ? 'sticker' : 'image'
    const prepared = await prepareImageForWhatsApp(buffer, filename, mime, { kind })
    outBuffer = prepared.buffer
    mime = prepared.mime
    outName = prepared.filename
    opts.log?.info(
      { mime, bytes: outBuffer.length, filename: outName, sourceBytes, kind },
      'outbound_image_prepared',
    )
  } else if (mime.startsWith('video/')) {
    const prepared = await prepareVideoForWhatsApp(buffer, filename, mime)
    outBuffer = prepared.buffer
    mime = prepared.mime
    outName = prepared.filename
    opts.log?.info(
      { mime, bytes: outBuffer.length, filename: outName, sourceBytes },
      'outbound_video_prepared',
    )
  } else {
    const prepared = await prepareDocumentForWhatsApp(buffer, filename, mime)
    outBuffer = prepared.buffer
    mime = prepared.mime
    outName = prepared.filename
    opts.log?.info(
      { mime, bytes: outBuffer.length, filename: outName, sourceBytes },
      'outbound_document_prepared',
    )
  }

  const mediaKind = mediaKindFromMime(mime)
  const cap = capForMime(mime)
  if (outBuffer.length > cap) {
    throw errors.mediaTooLarge(
      `${mediaKind} is still too large after processing (${outBuffer.length} bytes, max ${cap}).`,
    )
  }

  return {
    buffer: outBuffer,
    mime,
    filename: outName,
    voiceNote,
    mediaKind,
    sourceBytes,
  }
}
