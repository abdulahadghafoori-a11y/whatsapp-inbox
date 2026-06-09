import { describe, expect, it, vi } from 'vitest'
import {
  canForwardMediaMessage,
  isMessageMediaLocallyPresent,
  isVisualForwardableMedia,
} from './messageForward'
import type { Message } from '@/types'

vi.mock('@/lib/messageMediaCache', () => ({
  getCachedMediaUriSync: vi.fn(() => null),
}))

import { getCachedMediaUriSync } from '@/lib/messageMediaCache'

const mockCached = vi.mocked(getCachedMediaUriSync)

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

describe('isMessageMediaLocallyPresent', () => {
  it('true when local preview exists', () => {
    expect(isMessageMediaLocallyPresent(base({ localPreviewUri: 'file:///x.jpg' }))).toBe(true)
  })

  it('true when disk cache hit', () => {
    mockCached.mockReturnValueOnce('file:///cached.jpg')
    expect(isMessageMediaLocallyPresent(base())).toBe(true)
  })

  it('false for inbound with only remote key', () => {
    mockCached.mockReturnValue(null)
    expect(isMessageMediaLocallyPresent(base())).toBe(false)
  })

  it('true for sent outbound with media key', () => {
    expect(
      isMessageMediaLocallyPresent(
        base({
          direction: 'outbound',
          status: 'delivered',
        }),
      ),
    ).toBe(true)
  })
})

describe('canForwardMediaMessage', () => {
  it('blocks inbound image with only remote mediaUrl', () => {
    mockCached.mockReturnValue(null)
    expect(canForwardMediaMessage(base())).toBe(false)
  })

  it('allows inbound image when cached locally', () => {
    mockCached.mockReturnValueOnce('file:///cached.jpg')
    expect(canForwardMediaMessage(base())).toBe(true)
  })

  it('allows inbound image with localPreviewUri', () => {
    expect(canForwardMediaMessage(base({ localPreviewUri: 'file:///x.jpg' }))).toBe(true)
  })

  it('blocks pending outbound', () => {
    expect(
      canForwardMediaMessage(
        base({
          direction: 'outbound',
          status: 'pending',
          id: 'pending-media-1',
        }),
      ),
    ).toBe(false)
  })

  it('blocks deleted', () => {
    expect(canForwardMediaMessage(base({ deletedAt: new Date().toISOString() }))).toBe(false)
  })

  it('blocks text', () => {
    expect(canForwardMediaMessage(base({ type: 'text', mediaUrl: null }))).toBe(false)
  })

  it('blocks inbound failed download', () => {
    expect(canForwardMediaMessage(base({ mediaStatus: 'failed' }))).toBe(false)
  })
})

describe('isVisualForwardableMedia', () => {
  it('is true for cached image', () => {
    mockCached.mockReturnValueOnce('file:///cached.jpg')
    expect(isVisualForwardableMedia(base())).toBe(true)
  })

  it('is false for audio', () => {
    mockCached.mockReturnValueOnce('file:///cached.mp3')
    expect(canForwardMediaMessage(base({ type: 'audio' }))).toBe(true)
    expect(isVisualForwardableMedia(base({ type: 'audio' }))).toBe(false)
  })
})
