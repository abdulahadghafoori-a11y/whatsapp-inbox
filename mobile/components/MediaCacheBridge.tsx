import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ensureMediaIndexLoaded } from '@/lib/messageMediaCache'
import { syncConversationMedia } from '@/lib/messageMediaSync'
import type { MessagesResponse } from '@/types'

/**
 * When message lists are hydrated (network or disk), copy media into app storage
 * so chats stay readable offline — similar to WhatsApp's local media store.
 */
export function MediaCacheBridge() {
  const qc = useQueryClient()

  useEffect(() => {
    void ensureMediaIndexLoaded()

    const cache = qc.getQueryCache()
    const run = () => {
      const queries = cache.findAll({ queryKey: ['messages'] })
      for (const query of queries) {
        const data = query.state.data as MessagesResponse | undefined
        if (data?.messages?.length) syncConversationMedia(data.messages)
      }
    }

    run()
    const unsub = cache.subscribe((event) => {
      if (event?.type === 'updated' && event.query.queryKey[0] === 'messages') {
        run()
      }
    })
    return unsub
  }, [qc])

  return null
}
