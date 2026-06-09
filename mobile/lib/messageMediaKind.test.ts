import { describe, it, expect } from 'vitest'
import {
  isStickerType,
  isTextLikeType,
  isHeavyMediaType,
  isUrlFirstMediaType,
  needsFileCacheSync,
} from '@/lib/messageMediaKind'

describe('messageMediaKind', () => {
  it('classifies sticker', () => {
    expect(isStickerType('sticker')).toBe(true)
    expect(isStickerType('image')).toBe(false)
  })

  it('treats text/location/sticker as text-like (no download gate)', () => {
    expect(isTextLikeType('text')).toBe(true)
    expect(isTextLikeType('location')).toBe(true)
    expect(isTextLikeType('sticker')).toBe(true)
    expect(isTextLikeType('image')).toBe(false)
  })

  it('flags only heavy attachments for auto-download', () => {
    for (const t of ['image', 'video', 'audio', 'document'] as const) {
      expect(isHeavyMediaType(t)).toBe(true)
    }
    for (const t of ['text', 'location', 'sticker', 'contacts', 'interactive', 'button'] as const) {
      expect(isHeavyMediaType(t)).toBe(false)
    }
  })

  it('loads images and stickers from URL, not file-cache sync', () => {
    expect(isUrlFirstMediaType('image')).toBe(true)
    expect(isUrlFirstMediaType('sticker')).toBe(true)
    expect(isUrlFirstMediaType('video')).toBe(false)
    expect(needsFileCacheSync('video')).toBe(true)
    expect(needsFileCacheSync('image')).toBe(false)
    expect(needsFileCacheSync('sticker')).toBe(false)
  })
})
