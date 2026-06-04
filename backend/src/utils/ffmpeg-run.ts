import { spawn } from 'child_process'
import { getFfmpegPath } from './ffmpeg-path.js'

export function ffmpegBin(): string {
  return getFfmpegPath()
}

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stderr)
      else reject(new Error(stderr.slice(-2500) || `ffmpeg exit ${code}`))
    })
  })
}

export type MediaProbe = {
  durationSec: number
  width: number
  height: number
}

function parseDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  const sec = Number(m[3])
  return h * 3600 + min * 60 + sec
}

function parseVideoSize(stderr: string): { width: number; height: number } | null {
  const m = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

/** Probe duration and video dimensions via ffmpeg (no ffprobe dependency). */
export async function probeMediaFile(filePath: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), ['-hide_banner', '-i', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', () => {
      const durationSec = parseDuration(stderr)
      const size = parseVideoSize(stderr)
      if (durationSec == null || !size) {
        reject(new Error('Could not read video metadata'))
        return
      }
      resolve({ durationSec, width: size.width, height: size.height })
    })
  })
}
