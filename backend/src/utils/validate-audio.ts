import { errors } from './errors.js'
import { analyzeAudioBuffer } from './inbound-audio-profile.js'
import { looksLikeAmr, looksLikeMp4 } from './audio-buffer.js'

export type ValidatedAudio = {
  buffer: Buffer
  mime: string
  filename: string
  voiceNote: boolean
}

/**
 * Client must send OGG Opus for voice notes (device-encoded).
 * Server validates only — no transcoding.
 */
export function validateAudioForWhatsApp(buffer: Buffer, filename: string, mimeHint: string): ValidatedAudio {
  if (buffer.length < 200) {
    throw errors.validation('Recording is too short or empty.')
  }

  const analysis = analyzeAudioBuffer(buffer)
  const mimeLower = mimeHint.toLowerCase()

  if (analysis.isOggOpus || mimeLower.includes('ogg') || mimeLower.includes('opus')) {
    if (!analysis.isOggOpus) {
      throw errors.validation('Invalid voice message: file must be OGG Opus (OggS header missing).')
    }
    return {
      buffer,
      mime: 'audio/ogg',
      filename: filename.toLowerCase().endsWith('.ogg') ? filename : 'audio.ogg',
      voiceNote: true,
    }
  }

  if (looksLikeAmr(buffer) || mimeLower.includes('amr') || mimeLower.includes('3gp')) {
    const outName = filename.toLowerCase().endsWith('.amr') || filename.toLowerCase().endsWith('.3gp')
      ? filename
      : `audio-${Date.now()}.amr`
    return {
      buffer,
      mime: 'audio/amr',
      filename: outName,
      voiceNote: false,
    }
  }

  if (looksLikeMp4(buffer) || mimeLower.includes('mp4') || mimeLower.includes('m4a') || mimeLower.includes('aac')) {
    throw errors.validation(
      'Voice messages must be sent as OGG Opus from the app. Update the mobile app and record again.',
    )
  }

  throw errors.validation(
    `Unsupported audio format (${mimeHint}). Use OGG Opus voice notes from the mobile app.`,
  )
}
