import { readFile, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { errors } from './errors.js'
import { probeMediaFile, runFfmpeg } from './ffmpeg-run.js'
import {
  WA_VIDEO_MAX_BYTES,
  WA_VIDEO_MAX_DURATION_SEC,
  WA_VIDEO_MAX_EDGE,
} from './wa-media-limits.js'

export type PreparedVideo = {
  buffer: Buffer
  mime: string
  filename: string
}

function baseName(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

function withMp4(filename: string): string {
  return `${baseName(filename)}.mp4`
}

function guessInputExt(filename: string, mime: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.mov')) return 'mov'
  if (lower.endsWith('.webm')) return 'webm'
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return '3gp'
  if (mime.includes('quicktime')) return 'mov'
  return 'mp4'
}

const SCALE_STEPS = [WA_VIDEO_MAX_EDGE, 960, 720, 540, 420] as const
const VIDEO_BITRATES = ['1400k', '1100k', '900k', '700k', '550k', '400k'] as const

/** Fast remux — fixes phone clips that claim video/mp4 but lack a proper MP4 container. */
async function remuxToWhatsAppMp4(inPath: string, outPath: string): Promise<Buffer> {
  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inPath,
    '-map',
    '0:v:0?',
    '-map',
    '0:a:0?',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    '-brand',
    'mp42',
    '-f',
    'mp4',
    outPath,
  ])
  return readFile(outPath)
}

async function transcodeAttempt(
  inPath: string,
  outPath: string,
  maxEdge: number,
  videoBitrate: string,
): Promise<Buffer> {
  const bufsize = `${Math.round(parseInt(videoBitrate, 10) * 1.5)}k`
  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inPath,
    '-vf',
    `scale=${maxEdge}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-profile:v',
    'main',
    '-level',
    '3.1',
    '-pix_fmt',
    'yuv420p',
    '-maxrate',
    videoBitrate,
    '-bufsize',
    bufsize,
    '-movflags',
    '+faststart',
    '-brand',
    'mp42',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-f',
    'mp4',
    outPath,
  ])
  return readFile(outPath)
}

/**
 * Transcode to H.264 + AAC MP4 under WhatsApp's 16MB cap (like the official app).
 */
export async function prepareVideoForWhatsApp(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
): Promise<PreparedVideo> {
  if (buffer.length < 400) {
    throw errors.validation('Video file is empty or invalid.')
  }

  const id = randomUUID()
  const ext = guessInputExt(filename, mimeHint)
  const inPath = join(tmpdir(), `wa-vin-${id}.${ext}`)
  const outPath = join(tmpdir(), `wa-vout-${id}.mp4`)

  try {
    await writeFile(inPath, buffer)

    let probe: Awaited<ReturnType<typeof probeMediaFile>>
    try {
      probe = await probeMediaFile(inPath)
    } catch {
      throw errors.validation('File is not a valid video.')
    }

    if (probe.durationSec > WA_VIDEO_MAX_DURATION_SEC) {
      throw errors.validation(
        `Video is too long (${Math.ceil(probe.durationSec / 60)} min). WhatsApp allows up to 16 minutes.`,
      )
    }

    const longEdge = Math.max(probe.width, probe.height)

    try {
      await unlink(outPath).catch(() => undefined)
      const remuxed = await remuxToWhatsAppMp4(inPath, outPath)
      if (
        remuxed.length >= 400 &&
        remuxed.length <= WA_VIDEO_MAX_BYTES &&
        longEdge <= WA_VIDEO_MAX_EDGE
      ) {
        return { buffer: remuxed, mime: 'video/mp4', filename: withMp4(filename) }
      }
    } catch {
      // Fall through to full transcode (unsupported codecs, etc.).
    }

    for (const edge of SCALE_STEPS) {
      for (const vbr of VIDEO_BITRATES) {
        await unlink(outPath).catch(() => undefined)
        const out = await transcodeAttempt(inPath, outPath, edge, vbr)
        if (out.length <= WA_VIDEO_MAX_BYTES) {
          return { buffer: out, mime: 'video/mp4', filename: withMp4(filename) }
        }
      }
    }

    throw errors.mediaTooLarge(
      'Video is too large to send on WhatsApp even after compression. Try a shorter clip or lower resolution.',
    )
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => undefined),
      unlink(outPath).catch(() => undefined),
    ])
  }
}
