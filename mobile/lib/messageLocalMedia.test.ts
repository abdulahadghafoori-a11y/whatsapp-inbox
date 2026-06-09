import { describe, expect, it, vi } from 'vitest'
import { resolveMessageLocalMediaUri } from '@/lib/messageLocalMedia'
import type { Message } from '@/types'

vi.mock('@/lib/messageMediaCache', () => ({
  resolveCachedMediaUriSync: vi.fn(() => null),
}))

vi.mock('@/lib/uploadUri', () => ({
  resolveUploadUri: (u: string) => u,
}))

import { resolveCachedMediaUriSync } from '@/lib/messageMediaCache'

const mockCached = vi.mocked(resolveCachedMediaUriSync)

function base(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'c1',
    waMessageId: 'w1',
    sentBy: null,
    direction: 'inbound',
    type: 'image',
    body: null,
    mediaUrl: 'media/c1/msg-1/photo.jpg',
    mediaMimeType: 'image/jpeg',
    mediaFilename: 'photo.jpg',
    mediaStatus: 'ready',
    status: 'delivered',
    errorMessage: null,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('resolveMessageLocalMediaUri', () => {
  it('prefers optimistic local preview', () => {
    expect(
      resolveMessageLocalMediaUri(
        base({ localPreviewUri: 'file:///preview.jpg', localCacheUri: 'file:///cached.jpg' }),
      ),
    ).toBe('file:///preview.jpg')
  })

  it('uses SQLite local cache path before disk index', () => {
    mockCached.mockReturnValueOnce('file:///index.jpg')
    expect(resolveMessageLocalMediaUri(base({ localCacheUri: 'file:///sqlite.jpg' }))).toBe(
      'file:///sqlite.jpg',
    )
  })

  it('falls back to disk index', () => {
    mockCached.mockReturnValueOnce('file:///index.jpg')
    expect(resolveMessageLocalMediaUri(base())).toBe('file:///index.jpg')
  })
})
