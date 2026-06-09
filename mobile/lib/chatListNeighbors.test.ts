import { describe, expect, it } from 'vitest'
import { enrichChatListWithGroups } from '@/lib/chatListNeighbors'
import type { ChatListItem } from '@/lib/chatListItems'
import type { Message } from '@/types'

function msg(id: string, direction: Message['direction'] = 'inbound'): Message {
  return {
    id,
    conversationId: 'c1',
    waMessageId: `w-${id}`,
    sentBy: direction === 'inbound' ? null : 'agent-1',
    direction,
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
  }
}

const row = (m: Message): ChatListItem => ({
  kind: 'message',
  id: m.id,
  message: m,
  layoutHeight: 72,
})

describe('enrichChatListWithGroups', () => {
  it('groups consecutive inbound messages', () => {
    const items = enrichChatListWithGroups([row(msg('a')), row(msg('b'))])
    expect(items[0].kind === 'message' && items[0].groupPosition).toBe('first')
    expect(items[0].kind === 'message' && items[0].showAvatar).toBe(true)
    expect(items[1].kind === 'message' && items[1].groupPosition).toBe('last')
    expect(items[1].kind === 'message' && items[1].showAvatar).toBe(false)
  })
})
