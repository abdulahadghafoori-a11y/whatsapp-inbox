import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export type MessageSearchResult = {
  messageId: string
  conversationId: string
  body: string | null
  direction: 'inbound' | 'outbound'
  type: string
  sentAt: string
  contactName: string | null
  contactWaId: string
}

/** Searches message content across all conversations (min 2 chars). */
export function useGlobalMessageSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['message-search', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<{ results: MessageSearchResult[]; nextCursor: string | null }>(
        '/messages/search',
        { params: { q } },
      )
      return res.data.results
    },
  })
}
