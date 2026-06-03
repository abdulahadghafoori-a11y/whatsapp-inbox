import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getFfmpegPath } from './ffmpeg-path.js'
import { looksLikeAmr } from './audio-buffer.js'
import {
  analyzeAudioBuffer,
  loadInboundAudioProfile,
  type InboundAudioProfile,
} from './inbound-audio-profile.js'
import type { S3Service } from '../services/s3.js'
import { errors } from './errors.js'

function ffmpegBin(): string {
  return getFfmpegPath()
}

function guessInputExt(filename: string, buffer: Buffer): string {
  const lower = filename.toLowerCase()
  const analysis = analyzeAudioBuffer(buffer)
  if (analysis.isOggOpus) return 'ogg'
  if (analysis.isAmr) return 'amr'
  if (analysis.isMp4) return 'm4a'
  if (lower.endsWith('.3gp')) return '3gp'
  if (lower.endsWith('.amr')) return 'amr'
  if (lower.endsWith('.caf')) return 'caf'
  if (lower.endsWith('.ogg')) return 'ogg'
  if (lower.endsWith('.mp3')) return 'mp3'
  return 'm4a'
}

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stderr)
      else reject(new Error(stderr.slice(-2000) || `ffmpeg exit ${code}`))
    })
  })
}

function assertOggOutput(buffer: Buffer): void {
  if (buffer.length < 200 || buffer.subarray(0, 4).toString('ascii') !== 'OggS') {
    throw new Error('Transcoder did not produce a valid OGG file')
  }
}

async function encodeWavToOgg(wavPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    wavPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '48000',
    '-c:a',
    'libopus',
    '-b:a',
    '24k',
    '-application',
    'voip',
    '-f',
    'ogg',
    outPath,
  ])
}

async function decodeToWav(inPath: string, wavPath: string, _inputExt: string): Promise<void> {
  const attempts: string[][] = [
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', inPath, '-vn', '-ac', '1', '-ar', '48000', '-f', 'wav', wavPath],
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'mp4',
      '-i',
      inPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'wav',
      wavPath,
    ],
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'caf',
      '-i',
      inPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'wav',
      wavPath,
    ],
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'amr',
      '-i',
      inPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'wav',
      wavPath,
    ],
  ]

  let lastErr: Error | null = null
  for (const args of attempts) {
    try {
      await runFfmpeg(args)
      return
    } catch (err) {
      lastErr = err as Error
      await unlink(wavPath).catch(() => undefined)
    }
  }
  throw lastErr ?? new Error('Could not decode recording')
}

/** Match WhatsApp inbound voice notes: mono Opus in OGG container. */
async function transcodeToOggOpus(input: Buffer, inputExt: string): Promise<Buffer> {
  const id = randomUUID()
  const inPath = join(tmpdir(), `wa-in-${id}.${inputExt}`)
  const outPath = join(tmpdir(), `wa-out-${id}.ogg`)
  const wavPath = join(tmpdir(), `wa-wav-${id}.wav`)

  try {
    await writeFile(inPath, input)

    try {
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '24k',
        '-application',
        'voip',
        '-f',
        'ogg',
        outPath,
      ])
    } catch {
      await decodeToWav(inPath, wavPath, inputExt)
      await encodeWavToOgg(wavPath, outPath)
    }

    const out = await readFile(outPath)
    assertOggOutput(out)
    return out
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => undefined),
      unlink(outPath).catch(() => undefined),
      unlink(wavPath).catch(() => undefined),
    ])
  }
}

export type PreparedAudio = {
  buffer: Buffer
  mime: string
  filename: string
  voiceNote: boolean
  reference: InboundAudioProfile | null
}

export async function prepareAudioForWhatsApp(
  buffer: Buffer,
  filename: string,
  opts: { conversationId?: string; s3?: S3Service; log?: { info: (o: unknown, m: string) => void; warn?: (o: unknown, m: string) => void } },
): Promise<PreparedAudio> {
  const reference =
    opts.conversationId && opts.s3
      ? await loadInboundAudioProfile(opts.conversationId, opts.s3).catch(() => null)
      : null

  if (reference) {
    opts.log?.info(
      {
        referenceMime: reference.mimeType,
        referenceFile: reference.filename,
        referenceBytes: reference.bytes,
        referenceMagic: reference.magic,
      },
      'inbound_audio_reference',
    )
  }

  if (buffer.length < 200) {
    throw errors.validation('Recording is too short or empty.')
  }

  const inputAnalysis = analyzeAudioBuffer(buffer)
  opts.log?.info(
    {
      filename,
      inputBytes: buffer.length,
      inputMagic: inputAnalysis.magic,
      isMp4: inputAnalysis.isMp4,
      isAmr: inputAnalysis.isAmr,
      ffmpeg: ffmpegBin(),
    },
    'outbound_audio_input',
  )

  if (looksLikeAmr(buffer)) {
    const outName = filename.toLowerCase().endsWith('.amr')
      ? filename
      : `audio-${Date.now()}.amr`
    return {
      buffer,
      mime: 'audio/amr',
      filename: outName,
      voiceNote: false,
      reference,
    }
  }

  if (inputAnalysis.isOggOpus) {
    return {
      buffer,
      mime: reference?.uploadMime ?? 'audio/ogg; codecs=opus',
      filename: reference?.filename ?? 'audio.ogg',
      voiceNote: true,
      reference,
    }
  }

  const ext = guessInputExt(filename, buffer)
  try {
    const ogg = await transcodeToOggOpus(buffer, ext)
    return {
      buffer: ogg,
      mime: reference?.uploadMime ?? 'audio/ogg; codecs=opus',
      filename: reference?.filename ?? 'audio.ogg',
      voiceNote: true,
      reference,
    }
  } catch (err) {
    opts.log?.warn?.(
      { err: (err as Error).message, ext, ffmpeg: ffmpegBin() },
      'outbound_audio_transcode_failed',
    )
    throw errors.validation(
      `Could not prepare voice message: ${(err as Error).message}`,
    )
  }
}
