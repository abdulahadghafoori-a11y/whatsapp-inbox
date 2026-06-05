/**
 * Tracks the conversation the agent currently has open so global socket handlers
 * can avoid incrementing the unread badge for a chat that's already on screen.
 */
let activeConversationId: string | null = null

export function setActiveConversationId(id: string | null): void {
  activeConversationId = id
}

export function getActiveConversationId(): string | null {
  return activeConversationId
}
