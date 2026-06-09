/** Persists chat scroll + loaded window across screen unmounts (back navigation). */

export type ChatState = {
  messageLimit: number
  /** Topmost visible message when leaving — stable across variable row heights. */
  anchorMessageId: string | null
  /** Pixel fallback when anchor row is not in the loaded window yet. */
  scrollOffset: number
}

const chatStateMap = new Map<string, ChatState>()

export const chatStateCache = {
  save(conversationId: string, state: ChatState): void {
    chatStateMap.set(conversationId, state)
  },

  restore(conversationId: string): ChatState | null {
    return chatStateMap.get(conversationId) ?? null
  },
}
