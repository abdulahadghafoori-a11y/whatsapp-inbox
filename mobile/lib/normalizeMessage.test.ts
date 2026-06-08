import { describe, it, expect } from 'vitest'
import { normalizeMessage } from '@/lib/normalizeMessage'
import type { Message } from '@/types'

const raw = (o: Record<string, unknown>) => o as Message & Record<string, unknown>

describe('normalizeMessage', () => {
  it('maps snake_case server fields to camelCase', () => {
    const m = normalizeMessage(
      raw({
        id: 'm1',
        conversation_id: 'c1',
        wa_message_id: 'wamid.1',
        media_url: 'media/x',
        media_mime_type: 'image/jpeg',
        sent_at: '2026-01-01T00:00:00.000Z',
      }),
    )
    expect(m.conversationId).toBe('c1')
    expect(m.waMessageId).toBe('wamid.1')
    expect(m.mediaUrl).toBe('media/x')
    expect(m.mediaMimeType).toBe('image/jpeg')
    expect(m.sentAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('applies sensible defaults for missing fields', () => {
    const m = normalizeMessage(raw({ id: 'm2', conversation_id: 'c1' }))
    expect(m.direction).toBe('outbound')
    expect(m.type).toBe('text')
    expect(m.status).toBe('sent')
    expect(m.body).toBeNull()
    expect(m.createdAt).toBe(m.sentAt) // createdAt falls back to sentAt
  })

  it('drops non-positive media sizes/dimensions to null', () => {
    const m = normalizeMessage(
      raw({ id: 'm3', conversation_id: 'c1', media_file_size: 0, media_width: -5, media_height: 0 }),
    )
    expect(m.mediaFileSize).toBeNull()
    expect(m.mediaWidth).toBeNull()
    expect(m.mediaHeight).toBeNull()
  })

  it('normalizes reactions and reply preview (snake_case aware)', () => {
    const m = normalizeMessage(
      raw({
        id: 'm4',
        conversation_id: 'c1',
        reactions: [{ emoji: '👍', agent_id: 'a1', agent_name: 'Ann' }],
        replyTo: { id: 'p1', type: 'image', body: 'hi', media_url: 'media/p', deleted_at: null },
      }),
    )
    expect(m.reactions).toEqual([{ emoji: '👍', agentId: 'a1', agentName: 'Ann' }])
    expect(m.replyTo?.id).toBe('p1')
    expect(m.replyTo?.type).toBe('image')
    expect(m.replyTo?.mediaUrl).toBe('media/p')
  })

  it('returns null replyTo when absent', () => {
    const m = normalizeMessage(raw({ id: 'm5', conversation_id: 'c1' }))
    expect(m.replyTo).toBeNull()
  })
})
