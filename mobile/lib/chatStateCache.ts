/** Persists chat scroll + loaded window across screen unmounts (back navigation). */

export type ChatState = {
  scrollOffset: number
  messageLimit: number
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
