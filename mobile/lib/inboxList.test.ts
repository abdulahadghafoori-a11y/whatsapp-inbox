import { describe, it, expect } from 'vitest'
import {
  conversationInboxEqual,
  stabilizeConversationList,
} from '@/lib/inboxList'
import type { ConversationListItem } from '@/types'

const conv = (o: Partial<ConversationListItem> = {}): ConversationListItem =>
  ({
    id: 'c1',
    unreadCount: 0,
    pinnedAt: null,
    lastMessageAt: '2026-01-01T00:00:00.000Z',
    lastMessagePreview: 'hi',
    lastMessageDirection: 'inbound',
    lastMessageStatus: 'delivered',
    lastMessageType: 'text',
    contact: { name: 'Ann', waId: '111' },
    isCtwaLead: false,
    aiHandled: false,
    assignedAgent: null,
    ...o,
  }) as ConversationListItem

describe('conversationInboxEqual', () => {
  it('true when visible fields match', () => {
    expect(conversationInboxEqual(conv(), conv())).toBe(true)
  })

  it('false when unread count or preview changes', () => {
    expect(conversationInboxEqual(conv(), conv({ unreadCount: 2 }))).toBe(false)
    expect(conversationInboxEqual(conv(), conv({ lastMessagePreview: 'new' }))).toBe(false)
  })
})

describe('stabilizeConversationList', () => {
  it('returns the previous array when nothing changed (preserves ref)', () => {
    const prev = [conv({ id: 'a' }), conv({ id: 'b' })]
    const next = [conv({ id: 'a' }), conv({ id: 'b' })]
    expect(stabilizeConversationList(prev, next)).toBe(prev)
  })

  it('reuses unchanged row refs but swaps in changed rows', () => {
    const prev = [conv({ id: 'a' }), conv({ id: 'b' })]
    const next = [conv({ id: 'a' }), conv({ id: 'b', unreadCount: 3 })]
    const out = stabilizeConversationList(prev, next)
    expect(out).not.toBe(prev)
    expect(out[0]).toBe(prev[0]) // unchanged row kept stable
    expect(out[1]).toBe(next[1]) // changed row replaced
  })

  it('reuses unchanged row refs when length grows (pagination)', () => {
    const prev = [conv({ id: 'a' }), conv({ id: 'b' })]
    const next = [conv({ id: 'a' }), conv({ id: 'b' }), conv({ id: 'c' })]
    const out = stabilizeConversationList(prev, next)
    expect(out).not.toBe(prev)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).toBe(prev[1])
    expect(out[2]).toBe(next[2])
  })

  it('reuses unchanged row refs when length shrinks', () => {
    const prev = [conv({ id: 'a' }), conv({ id: 'b' }), conv({ id: 'c' })]
    const next = [conv({ id: 'a' }), conv({ id: 'c' })]
    const out = stabilizeConversationList(prev, next)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).toBe(prev[2])
  })
})
