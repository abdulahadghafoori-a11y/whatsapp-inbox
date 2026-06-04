import type { Message } from '../db/schema.js'

/** Fields to sync on conversations when the latest message changes. */
export function conversationPreviewFromMessage(message: Pick<Message, 'id' | 'direction' | 'status' | 'type'>) {
  return {
    lastMessageId: message.id,
    lastMessageDirection: message.direction,
    lastMessageStatus: message.status,
    lastMessageType: message.type,
  }
}
