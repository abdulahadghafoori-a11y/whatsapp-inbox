import { describe, expect, it } from 'vitest'
import { stabilizeChatListItems, type ChatListItem } from '@/lib/chatListItems'
import type { Message } from '@/types'

function msg(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: 'c1',
    waMessageId: `w-${id}`,
    sentBy: null,
    direction: 'inbound',
    type: 'text',
    body: 'hi',
    mediaUrl: null,
    mediaMimeType: null,
    mediaFilename: null,
    mediaStatus: null,
    status: 'delivered',
    errorMessage: null,
    sentAt: '2026-01-01T12:00:00.000Z',
    createdAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  }
}

const messageRow = (m: Message): ChatListItem => ({
  kind: 'message',
  id: m.id,
  message: m,
})

const dateRow = (id: string, label: string): ChatListItem => ({
  kind: 'date',
  id,
  dateIso: '2026-01-01T12:00:00.000Z',
  label,
})

describe('stabilizeChatListItems', () => {
  it('returns the previous array when nothing changed', () => {
    const prev = [messageRow(msg('a')), dateRow('date-2026-0-1', 'Jan 1')]
    const next = [messageRow(msg('a')), dateRow('date-2026-0-1', 'Jan 1')]
    expect(stabilizeChatListItems(prev, next)).toBe(prev)
  })

  it('reuses unchanged row refs when older messages load', () => {
    const mA = msg('a')
    const mB = msg('b', { sentAt: '2026-01-02T12:00:00.000Z' })
    const prev = [messageRow(mA), dateRow('date-2026-0-1', 'Jan 1')]
    const next = [
      messageRow(mA),
      dateRow('date-2026-0-1', 'Jan 1'),
      messageRow(mB),
      dateRow('date-2026-0-2', 'Jan 2'),
    ]
    const out = stabilizeChatListItems(prev, next)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).toBe(prev[1])
    expect(out[2]).toBe(next[2])
    expect(out[3]).toBe(next[3])
  })

  it('swaps in changed message rows', () => {
    const prev = [messageRow(msg('a', { body: 'old' }))]
    const next = [messageRow(msg('a', { body: 'new' }))]
    const out = stabilizeChatListItems(prev, next)
    expect(out[0]).toBe(next[0])
  })
})
