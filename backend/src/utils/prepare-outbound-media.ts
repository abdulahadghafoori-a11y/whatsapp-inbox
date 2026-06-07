import type { FastifyBaseLogger } from 'fastify'
import { errors } from './errors.js'

function sanitizeFilename(filename: string): string {
  let name = filename
  try {
    name = decodeURIComponent(filename)
  } catch {
    /* keep */
  }
  const base = name.split(/[/\\]/).pop() ?? 'file'
  const safe = base.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 200)
  return safe || `file-${Date.now()}`
}
import { normalizeWhatsAppMime } from './mime-normalize.js'
import { validateAudioForWhatsApp } from './validate-audio.js'
import { validateImageForWhatsApp } from './prepare-image.js'
import { validateVideoForWhatsApp } from './validate-video.js'
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
  log?: FastifyBaseLogger
}

/**
 * Single entry point: validate outbound media before WhatsApp upload.
 * Images, video, and voice are prepared on the mobile client; server validates caps/format.
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
  let outName = sanitizeFilename(filename)
  let voiceNote = false

  if (mime.startsWith('audio/')) {
    const prepared = validateAudioForWhatsApp(buffer, filename, mime)
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
    const prepared = await validateImageForWhatsApp(buffer, filename, mime, { kind })
    outBuffer = prepared.buffer
    mime = prepared.mime
    outName = prepared.filename
    opts.log?.info(
      { mime, bytes: outBuffer.length, filename: outName, sourceBytes, kind },
      'outbound_image_validated',
    )
  } else if (mime.startsWith('video/')) {
    const prepared = validateVideoForWhatsApp(buffer, filename, mime)
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
