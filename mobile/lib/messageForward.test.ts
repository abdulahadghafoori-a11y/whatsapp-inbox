import { describe, expect, it } from 'vitest'
import { canForwardMediaMessage, isVisualForwardableMedia } from './messageForward'
import type { Message } from '@/types'

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

describe('canForwardMediaMessage', () => {
  it('allows delivered image with mediaUrl', () => {
    expect(canForwardMediaMessage(base())).toBe(true)
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
})

describe('isVisualForwardableMedia', () => {
  it('is true for image', () => {
    expect(isVisualForwardableMedia(base())).toBe(true)
  })

  it('is false for audio', () => {
    expect(canForwardMediaMessage(base({ type: 'audio' }))).toBe(true)
    expect(isVisualForwardableMedia(base({ type: 'audio' }))).toBe(false)
  })
})
