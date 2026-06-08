import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { searchLocalMessages } from '@/lib/db/repo'

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

/**
 * Searches message content across all conversations (min 2 chars). Server is
 * authoritative; on-device results merge in for instant/offline hits.
 */
export function useGlobalMessageSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['message-search', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const [serverRes, localHits] = await Promise.all([
        api
          .get<{ results: MessageSearchResult[]; nextCursor: string | null }>(
            '/messages/search',
            { params: { q } },
          )
          .then((r) => r.data.results)
          .catch(() => [] as MessageSearchResult[]),
        searchLocalMessages(q),
      ])

      const byId = new Map<string, MessageSearchResult>()
      for (const r of serverRes) byId.set(r.messageId, r)
      for (const hit of localHits) {
        if (!byId.has(hit.messageId)) byId.set(hit.messageId, hit)
      }
      return [...byId.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    },
  })
}
