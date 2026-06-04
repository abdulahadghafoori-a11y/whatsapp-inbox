import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  prepareImageForWhatsApp,
  WA_IMAGE_MAX_BYTES,
  WA_PHOTO_MAX_EDGE,
  WA_STICKER_MAX_BYTES,
  WA_STICKER_MAX_EDGE,
} from './prepare-image.js'

describe('prepareImageForWhatsApp', () => {
  it('compresses oversized photos under the 5MB cap', async () => {
    const big = await sharp({
      create: { width: 3200, height: 2400, channels: 3, background: '#336699' },
    })
      .png({ compressionLevel: 0 })
      .toBuffer()

    expect(big.length).toBeGreaterThan(WA_IMAGE_MAX_BYTES)

    const prepared = await prepareImageForWhatsApp(big, 'photo.jpg', 'image/jpeg')
    expect(prepared.mime).toBe('image/jpeg')
    expect(prepared.buffer.length).toBeLessThanOrEqual(WA_IMAGE_MAX_BYTES)

    const meta = await sharp(prepared.buffer).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(WA_PHOTO_MAX_EDGE)
  })

  it('passes through small JPEGs that already fit limits', async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#aabbcc' },
    })
      .jpeg({ quality: 80 })
      .toBuffer()

    const prepared = await prepareImageForWhatsApp(small, 'thumb.jpg', 'image/jpeg')
    expect(prepared.buffer).toEqual(small)
    expect(prepared.mime).toBe('image/jpeg')
  })

  it('compresses oversized stickers to WebP under 500KB', async () => {
    const big = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer()

    const prepared = await prepareImageForWhatsApp(big, 'sticker.webp', 'image/webp', {
      kind: 'sticker',
    })
    expect(prepared.mime).toBe('image/webp')
    expect(prepared.buffer.length).toBeLessThanOrEqual(WA_STICKER_MAX_BYTES)

    const meta = await sharp(prepared.buffer).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(WA_STICKER_MAX_EDGE)
  })
})
