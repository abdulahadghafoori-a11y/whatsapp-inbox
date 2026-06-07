import { describe, it, expect } from 'vitest'
import { contentAddressedKey, extFromFilename } from './content-addressed-key.js'

describe('contentAddressedKey', () => {
  it('same bytes and filename produce same key', () => {
    const buf = Buffer.from('hello')
    const a = contentAddressedKey(buf, 'photo.jpg', 'image/jpeg')
    const b = contentAddressedKey(buf, 'photo.jpg', 'image/jpeg')
    expect(a).toBe(b)
    expect(a.startsWith('media/blobs/')).toBe(true)
    expect(a.endsWith('.jpg')).toBe(true)
  })

  it('hash is stable; extension follows filename', () => {
    const buf = Buffer.from('hello')
    const jpg = contentAddressedKey(buf, 'a.jpg', 'image/jpeg')
    const png = contentAddressedKey(buf, 'a.png', 'image/png')
    expect(jpg.slice(0, 12)).toBe(png.slice(0, 12))
    expect(jpg.endsWith('.jpg')).toBe(true)
    expect(png.endsWith('.png')).toBe(true)
  })

  it('extFromFilename falls back to mime', () => {
    expect(extFromFilename('upload', 'video/mp4')).toBe('.mp4')
  })
})
