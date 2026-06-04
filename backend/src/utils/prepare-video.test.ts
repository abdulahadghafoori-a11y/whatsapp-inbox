import { describe, expect, it } from 'vitest'
import { ffmpegBin } from './ffmpeg-run.js'
import { prepareVideoForWhatsApp } from './prepare-video.js'
import { runFfmpeg } from './ffmpeg-run.js'
import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { WA_VIDEO_MAX_BYTES } from './wa-media-limits.js'

const hasFfmpeg = Boolean(ffmpegBin())

describe.skipIf(!hasFfmpeg)('prepareVideoForWhatsApp', () => {
  it('transcodes a short test clip under the 16MB cap', async () => {
    const id = randomUUID()
    const outPath = join(tmpdir(), `wa-test-src-${id}.mp4`)

    try {
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=3:size=1920x1080:rate=30',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        outPath,
      ])

      const source = await readFile(outPath)
      const prepared = await prepareVideoForWhatsApp(source, 'clip.mp4', 'video/mp4')
      expect(prepared.mime).toBe('video/mp4')
      expect(prepared.buffer.length).toBeLessThanOrEqual(WA_VIDEO_MAX_BYTES)
      expect(prepared.filename.endsWith('.mp4')).toBe(true)
    } finally {
      await unlink(outPath).catch(() => undefined)
    }
  }, 60_000)
})
