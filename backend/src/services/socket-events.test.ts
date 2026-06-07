import { describe, expect, it, vi } from 'vitest'
import type { Server as SocketIOServer } from 'socket.io'
import { emitConversationAssigned, emitNewMessage } from './socket-events.js'

function mockIo() {
  const roomEmit = vi.fn()
  const emit = vi.fn()
  const to = vi.fn(() => ({ emit: roomEmit }))
  return { io: { to, emit } as unknown as SocketIOServer, to, roomEmit, emit }
}

describe('emitConversationAssigned', () => {
  it('notifies assigned agent and inbox without broadcasting assignment to everyone', () => {
    const { io, to, roomEmit, emit } = mockIo()
    emitConversationAssigned(io, 'conv-1', 'agent-1')

    expect(to).toHaveBeenCalledWith('agent:agent-1')
    expect(roomEmit).toHaveBeenCalledWith('conversation_assigned', { conversationId: 'conv-1' })
    expect(emit).toHaveBeenCalledWith('inbox_updated', { conversationId: 'conv-1' })
    expect(emit).not.toHaveBeenCalledWith('conversation_assigned', expect.anything())
  })
})

describe('emitNewMessage', () => {
  it('flattens messaging fields at the top level for mobile listeners', () => {
    const { io, emit } = mockIo()
    const message = { id: 'msg-1' } as Parameters<typeof emitNewMessage>[2]

    emitNewMessage(io, 'conv-1', message, {
      windowExpiresAt: '2026-01-01T00:00:00.000Z',
      fepExpiresAt: null,
      ctwaStartedAt: null,
      isWindowOpen: true,
      isFepOpen: false,
      isCtwaLead: false,
      canSendSession: true,
      canSendTemplate: true,
      needsTemplateForReply: false,
    })

    expect(emit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conv-1',
      message,
      windowExpiresAt: '2026-01-01T00:00:00.000Z',
      fepExpiresAt: null,
      ctwaStartedAt: null,
      isWindowOpen: true,
      isFepOpen: false,
      isCtwaLead: false,
      canSendSession: true,
      canSendTemplate: true,
      needsTemplateForReply: false,
    })
    expect(emit).toHaveBeenCalledWith('inbox_updated', { conversationId: 'conv-1' })
  })
})
