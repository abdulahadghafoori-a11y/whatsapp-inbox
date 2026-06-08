import { describe, it, expect } from 'vitest'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { Message } from '@/types'

const base = (o: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    waMessageId: null,
    sentBy: null,
    direction: 'outbound',
    type: 'text',
    body: 'hello',
    mediaUrl: null,
    mediaThumbUrl: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaFilename: null,
    mediaStatus: null,
    status: 'sent',
    errorMessage: null,
    replyToMessageId: null,
    deletedAt: null,
    editedAt: null,
    starredAt: null,
    reactions: undefined,
    replyTo: null,
    sentAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...o,
  }) as Message

describe('messageRenderEqual', () => {
  it('is true for identical content', () => {
    expect(messageRenderEqual(base(), base())).toBe(true)
  })

  it('is short-circuit true for the same reference', () => {
    const m = base()
    expect(messageRenderEqual(m, m)).toBe(true)
  })

  it('detects status / body changes', () => {
    expect(messageRenderEqual(base(), base({ status: 'delivered' }))).toBe(false)
    expect(messageRenderEqual(base(), base({ body: 'changed' }))).toBe(false)
  })

  it('detects reaction changes', () => {
    const a = base({ reactions: [{ emoji: '👍', agentId: 'a1', agentName: null }] })
    const b = base({ reactions: [{ emoji: '❤️', agentId: 'a1', agentName: null }] })
    expect(messageRenderEqual(a, b)).toBe(false)
    expect(messageRenderEqual(a, base({ reactions: [{ emoji: '👍', agentId: 'a1', agentName: null }] }))).toBe(true)
  })

  it('refreshes when the quoted reply media downloads', () => {
    const a = base({ replyTo: { id: 'p1', type: 'image', body: null, mediaUrl: null } as Message['replyTo'] })
    const b = base({ replyTo: { id: 'p1', type: 'image', body: null, mediaUrl: 'media/p' } as Message['replyTo'] })
    expect(messageRenderEqual(a, b)).toBe(false)
  })
})
