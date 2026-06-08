import type { Conversation } from '../db/schema.js'
import { shapeMessagingFields } from './messaging-windows.js'

export type ContactShape = {
  id: string
  waId: string
  name: string | null
  profilePictureUrl: string | null
}

/** Canonical ConversationListItem serializer — shared by REST list and the sync feed. */
export function shapeConversation(
  c: Conversation,
  contact: ContactShape,
  assignedName: string | null,
  assignedAvatar: string | null,
) {
  return {
    id: c.id,
    status: c.status,
    contact: {
      id: contact.id,
      waId: contact.waId,
      name: contact.name,
      profilePictureUrl: contact.profilePictureUrl,
    },
    assignedTo: c.assignedTo,
    assignedAgent: c.assignedTo ? { name: assignedName, avatarUrl: assignedAvatar } : null,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageId: c.lastMessageId,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageStatus: c.lastMessageStatus,
    lastMessageType: c.lastMessageType,
    pinnedAt: c.pinnedAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    aiHandled: c.aiHandled,
    ...shapeMessagingFields(c),
  }
}
