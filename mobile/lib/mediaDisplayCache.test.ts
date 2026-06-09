import { describe, expect, it, vi } from 'vitest'
import { warmMediaDisplayCacheFromMessages, mediaDisplayCache } from '@/lib/mediaDisplayCache'
import type { Message } from '@/types'

vi.mock('@/lib/messageMediaCache', () => ({
  resolveCachedMediaUriSync: vi.fn((id: string) =>
    id === 'm1' ? 'file:///cache/photo.jpg' : null,
  ),
}))

vi.mock('@/lib/uploadUri', () => ({
  resolveUploadUri: (u: string) => u,
}))

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    waMessageId: 'w1',
    sentBy: null,
    direction: 'inbound',
    type: 'image',
    body: null,
    mediaUrl: 'media/c1/m1/x.jpg',
    mediaMimeType: 'image/jpeg',
    mediaFilename: 'x.jpg',
    mediaStatus: 'ready',
    status: 'delivered',
    errorMessage: null,
    sentAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    mediaWidth: 800,
    mediaHeight: 600,
    ...overrides,
  }
}

describe('warmMediaDisplayCacheFromMessages', () => {
  it('seeds disk-backed image entries for session reads', () => {
    warmMediaDisplayCacheFromMessages([msg()])
    const hit = mediaDisplayCache.get('m1')
    expect(hit?.uri).toBe('file:///cache/photo.jpg')
    expect(hit?.width).toBe(800)
    expect(hit?.type).toBe('image')
  })

  it('skips messages without disk cache', () => {
    warmMediaDisplayCacheFromMessages([msg({ id: 'm2' })])
    expect(mediaDisplayCache.has('m2')).toBe(false)
  })
})
