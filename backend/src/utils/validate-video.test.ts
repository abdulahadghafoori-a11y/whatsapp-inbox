import { describe, expect, it } from 'vitest'
import { validateVideoForWhatsApp } from './validate-video.js'
import { WA_VIDEO_MAX_BYTES } from './wa-media-limits.js'

function minimalMp4(bytes: number): Buffer {
  const buf = Buffer.alloc(Math.max(bytes, 32))
  buf.writeUInt32BE(buf.length, 0)
  buf.write('ftyp', 4)
  buf.write('isom', 8)
  return buf
}

describe('validateVideoForWhatsApp', () => {
  it('accepts a small MP4', () => {
    const buf = minimalMp4(800)
    const r = validateVideoForWhatsApp(buf, 'clip.mov', 'video/quicktime')
    expect(r.mime).toBe('video/mp4')
    expect(r.filename.endsWith('.mp4')).toBe(true)
  })

  it('rejects non-mp4 magic', () => {
    expect(() => validateVideoForWhatsApp(Buffer.alloc(500), 'x.bin', 'video/mp4')).toThrow(/MP4/)
  })

  it('rejects oversized video', () => {
    const buf = minimalMp4(WA_VIDEO_MAX_BYTES + 1)
    expect(() => validateVideoForWhatsApp(buf, 'big.mp4', 'video/mp4')).toThrow(/too large/)
  })
})
