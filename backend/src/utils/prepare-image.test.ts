import { describe, expect, it } from 'vitest'
import {
  validateImageForWhatsApp,
  WA_IMAGE_MAX_BYTES,
  WA_STICKER_MAX_BYTES,
} from './prepare-image.js'

describe('validateImageForWhatsApp', () => {
  it('accepts a small JPEG as-is', async () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])
    const prepared = await validateImageForWhatsApp(jpeg, 'photo.jpg', 'image/jpeg')
    expect(prepared.mime).toBe('image/jpeg')
    expect(prepared.buffer).toEqual(jpeg)
    expect(prepared.filename).toBe('photo.jpg')
  })

  it('rejects oversized JPEG', async () => {
    const big = Buffer.alloc(WA_IMAGE_MAX_BYTES + 1, 0xff)
    await expect(
      validateImageForWhatsApp(big, 'big.jpg', 'image/jpeg'),
    ).rejects.toThrow(/exceeds/i)
  })

  it('rejects unsupported mime types', async () => {
    const buf = Buffer.from('not an image')
    await expect(
      validateImageForWhatsApp(buf, 'photo.gif', 'image/gif'),
    ).rejects.toThrow(/JPEG or PNG/i)
  })

  it('accepts a small WebP sticker', async () => {
    const webp = Buffer.from('RIFF....WEBP', 'ascii')
    const prepared = await validateImageForWhatsApp(webp, 'sticker.webp', 'image/webp', {
      kind: 'sticker',
    })
    expect(prepared.mime).toBe('image/webp')
    expect(prepared.buffer).toEqual(webp)
  })

  it('rejects oversized sticker', async () => {
    const big = Buffer.alloc(WA_STICKER_MAX_BYTES + 1, 0)
    await expect(
      validateImageForWhatsApp(big, 'sticker.webp', 'image/webp', { kind: 'sticker' }),
    ).rejects.toThrow(/exceeds/i)
  })
})
