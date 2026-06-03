import type { Server as SocketIOServer } from 'socket.io'
import type { Message } from '../db/schema.js'

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
