export type Role = 'admin' | 'agent' | 'ai_agent'
export type ConversationStatus = 'open' | 'resolved' | 'pending'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'played'
  | 'failed'
export type MediaStatus = 'pending' | 'uploaded' | 'failed' | null

export interface Agent {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: Role
  isOnline: boolean
}

export interface Contact {
  id: string
  waId: string
  name: string | null
  profilePictureUrl: string | null
}

export interface ConversationListItem {
  id: string
  status: ConversationStatus
  contact: Contact
  assignedTo: string | null
  assignedAgent: { name: string | null; avatarUrl: string | null } | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageId?: string | null
  lastMessageDirection?: MessageDirection | null
  lastMessageStatus?: MessageStatus | null
  lastMessageType?: MessageType | null
  pinnedAt?: string | null
  unreadCount: number
  windowExpiresAt: string | null
  fepExpiresAt: string | null
  ctwaStartedAt: string | null
  isWindowOpen: boolean
  isFepOpen: boolean
  isCtwaLead: boolean
  canSendSession: boolean
  canSendTemplate: boolean
  needsTemplateForReply: boolean
  aiHandled: boolean
}

export interface ConversationDetail extends ConversationListItem {
  notes: string | null
  ctwaClid: string | null
  referralSourceUrl: string | null
  referralSourceType: string | null
  adId: string | null
  adTitle: string | null
  adBody: string | null
  referralMetadata: Record<string, unknown> | null
  handoffReason: string | null
}

export interface MessageReplyPreview {
  id: string
  direction: MessageDirection
  type: MessageType
  body: string | null
  deletedAt: string | null
  mediaUrl?: string | null
  mediaMimeType?: string | null
  mediaFilename?: string | null
  /** Optimistic / in-flight parent media. */
  localPreviewUri?: string | null
}

export interface Message {
  id: string
  conversationId: string
  waMessageId: string | null
  sentBy: string | null
  direction: MessageDirection
  type: MessageType
  body: string | null
  mediaUrl: string | null
  mediaMimeType: string | null
  mediaFilename: string | null
  mediaStatus: MediaStatus
  status: MessageStatus
  errorMessage: string | null
  replyToMessageId?: string | null
  deletedAt?: string | null
  editedAt?: string | null
  replyTo?: MessageReplyPreview | null
  sentAt: string
  createdAt: string
  /** Client-only: show local file while outbound upload is in flight. */
  localPreviewUri?: string
  /** Client-only: permanent on-device copy (see messageMediaCache). */
  localCacheUri?: string
  metadata?: Record<string, unknown> | null
}

export interface Paginated<T> {
  nextCursor: string | null
}

export interface ConversationsResponse extends Paginated<ConversationListItem> {
  conversations: ConversationListItem[]
}

export interface MessagesResponse {
  messages: Message[]
  nextCursor: string | null
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  agent: Agent
}
