import { describe, expect, it } from 'vitest'
import {
  CHAT_DATE_ROW_HEIGHT,
  estimateChatMessageRowHeight,
} from '@/lib/chatListItemLayout'
import {
  chatListStructureKey,
  hydrateChatListItems,
  stabilizeChatListItems,
  type ChatListItem,
} from '@/lib/chatListItems'
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
  layoutHeight: estimateChatMessageRowHeight(m),
})

const dateRow = (id: string, label: string): ChatListItem => ({
  kind: 'date',
  id,
  dateIso: '2026-01-01T12:00:00.000Z',
  label,
  layoutHeight: CHAT_DATE_ROW_HEIGHT,
})

describe('chatListStructureKey', () => {
  it('is stable when only status changes', () => {
    const a = msg('a', { status: 'sent' })
    const b = msg('a', { status: 'delivered' })
    expect(chatListStructureKey([a])).toBe(chatListStructureKey([b]))
  })

  it('changes when media dimensions arrive', () => {
    const before = msg('a', { type: 'image' })
    const after = msg('a', { type: 'image', mediaWidth: 800, mediaHeight: 600 })
    expect(chatListStructureKey([before])).not.toBe(chatListStructureKey([after]))
  })
})

describe('hydrateChatListItems', () => {
  it('updates message refs without changing row ids or order', () => {
    const original = msg('a', { status: 'sent' })
    const items: ChatListItem[] = [messageRow(original)]
    const updated = msg('a', { status: 'delivered' })
    const out = hydrateChatListItems(items, [updated])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe(items[0]!.id)
    expect(out[0]!.kind).toBe('message')
    if (out[0]!.kind === 'message') {
      expect(out[0]!.message.status).toBe('delivered')
    }
  })
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

describe('estimateChatMessageRowHeight', () => {
  it('returns a taller row for images with intrinsic dimensions', () => {
    const text = estimateChatMessageRowHeight(msg('t'))
    const image = estimateChatMessageRowHeight(
      msg('i', { type: 'image', mediaWidth: 800, mediaHeight: 600 }),
    )
    expect(image).toBeGreaterThan(text)
  })
})
