import type { Server as SocketIOServer } from 'socket.io'
import type { Message } from '../db/schema.js'
import type { ShapedMessage } from '../utils/message-shape.js'

export type MessageStatusSocketPayload = {
  conversationId: string
  messageId?: string
  waMessageId?: string
  status: string
  scope?: 'inbound' | 'outbound'
  errorMessage?: string | null
}

export type MessagingSocketPayload = {
  windowExpiresAt: string | null
  fepExpiresAt: string | null
  ctwaStartedAt: string | null
  isWindowOpen: boolean
  isFepOpen: boolean
  isCtwaLead: boolean
  canSendSession: boolean
  canSendTemplate: boolean
  needsTemplateForReply: boolean
}

/** Broadcast to every connected agent (team inbox). */
export function emitNewMessage(
  io: SocketIOServer,
  conversationId: string,
  message: Message,
  messaging?: MessagingSocketPayload,
): void {
  io.emit('new_message', { conversationId, message, ...messaging })
  io.emit('inbox_updated', { conversationId })
}

export function emitMediaReady(
  io: SocketIOServer,
  conversationId: string,
  messageId: string,
  mediaUrl: string,
): void {
  io.emit('media_ready', { conversationId, messageId, mediaUrl })
}

export function emitMediaFailed(
  io: SocketIOServer,
  conversationId: string,
  messageId: string,
): void {
  io.emit('media_failed', { conversationId, messageId })
}

/** Delivery receipts — broadcast so agents see ticks without joining a room. */
export function emitMessageStatus(
  io: SocketIOServer,
  payload: MessageStatusSocketPayload,
): void {
  io.emit('message_status', payload)
}

export function emitMessageUpdated(
  io: SocketIOServer,
  conversationId: string,
  message: ShapedMessage,
): void {
  io.emit('message_updated', { conversationId, message })
}

export function emitMessageDeleted(
  io: SocketIOServer,
  conversationId: string,
  messageId: string,
): void {
  io.emit('message_deleted', { conversationId, messageId })
}

export function emitConversationUpdated(
  io: SocketIOServer,
  conversationId: string,
): void {
  io.emit('conversation_updated', { conversationId })
  io.emit('inbox_updated', { conversationId })
}

export function emitConversationAssigned(
  io: SocketIOServer,
  conversationId: string,
  agentId: string,
): void {
  io.to(`agent:${agentId}`).emit('conversation_assigned', { conversationId })
  io.emit('inbox_updated', { conversationId })
}
