import type { Server as SocketIOServer } from 'socket.io'
import {
  emitConversationAssigned,
  emitConversationUpdated,
  emitMediaFailed,
  emitMediaReady,
  emitMessageDeleted,
  emitMessageStatus,
  emitMessageUpdated,
  emitNewMessage,
  type MessageStatusSocketPayload,
  type MessagingSocketPayload,
} from '../services/socket-events.js'
import type { Message } from '../db/schema.js'
import type { ShapedMessage } from '../utils/message-shape.js'
import { config } from '../config.js'

export type SocketNotify = {
  emitNewMessage: (
    conversationId: string,
    message: Message,
    messaging?: MessagingSocketPayload,
  ) => Promise<void>
  emitMediaReady: (conversationId: string, messageId: string, mediaUrl: string) => Promise<void>
  emitMediaFailed: (conversationId: string, messageId: string) => Promise<void>
  emitMessageStatus: (payload: MessageStatusSocketPayload) => Promise<void>
  emitMessageUpdated: (conversationId: string, message: ShapedMessage) => Promise<void>
  emitMessageDeleted: (conversationId: string, messageId: string) => Promise<void>
  emitConversationUpdated: (conversationId: string) => Promise<void>
  emitConversationAssigned: (conversationId: string, agentId: string) => Promise<void>
}

export function createIoSocketNotify(io: SocketIOServer): SocketNotify {
  return {
    async emitNewMessage(conversationId, message, messaging) {
      emitNewMessage(io, conversationId, message, messaging)
    },
    async emitMediaReady(conversationId, messageId, mediaUrl) {
      emitMediaReady(io, conversationId, messageId, mediaUrl)
    },
    async emitMediaFailed(conversationId, messageId) {
      emitMediaFailed(io, conversationId, messageId)
    },
    async emitMessageStatus(payload) {
      emitMessageStatus(io, payload)
    },
    async emitMessageUpdated(conversationId, message) {
      emitMessageUpdated(io, conversationId, message)
    },
    async emitMessageDeleted(conversationId, messageId) {
      emitMessageDeleted(io, conversationId, messageId)
    },
    async emitConversationUpdated(conversationId) {
      emitConversationUpdated(io, conversationId)
    },
    async emitConversationAssigned(conversationId, agentId) {
      emitConversationAssigned(io, conversationId, agentId)
    },
  }
}

/** Worker → API bridge (Phase 1); replaced by outbox publisher in Phase 2. */
export function createHttpSocketNotify(apiBaseUrl: string): SocketNotify {
  const base = apiBaseUrl.replace(/\/$/, '')
  const secret = config.WORKER_INTERNAL_SECRET

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`${base}/internal/socket-emit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': secret,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`socket-emit failed ${res.status}: ${text}`)
    }
  }

  return {
    emitNewMessage: (conversationId, message, messaging) =>
      post({ type: 'new_message', conversationId, message, messaging }),
    emitMediaReady: (conversationId, messageId, mediaUrl) =>
      post({ type: 'media_ready', conversationId, messageId, mediaUrl }),
    emitMediaFailed: (conversationId, messageId) =>
      post({ type: 'media_failed', conversationId, messageId }),
    emitMessageStatus: (payload) => post({ type: 'message_status', payload }),
    emitMessageUpdated: (conversationId, message) =>
      post({ type: 'message_updated', conversationId, message }),
    emitMessageDeleted: (conversationId, messageId) =>
      post({ type: 'message_deleted', conversationId, messageId }),
    emitConversationUpdated: (conversationId) =>
      post({ type: 'conversation_updated', conversationId }),
    emitConversationAssigned: (conversationId, agentId) =>
      post({ type: 'conversation_assigned', conversationId, agentId }),
  }
}
