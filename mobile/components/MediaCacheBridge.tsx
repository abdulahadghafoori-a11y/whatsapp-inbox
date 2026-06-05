import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  cleanupUploadTempFiles,
  ensureMediaIndexLoaded,
} from '@/lib/messageMediaCache'
import { syncConversationMedia } from '@/lib/messageMediaSync'
import {
  coerceMessagesInfiniteData,
  flattenMessagesPages,
} from '@/lib/messagesQueryCache'

/**
 * When message lists are hydrated (network or disk), copy media into app storage
 * so chats stay readable offline — similar to WhatsApp's local media store.
 */
export function MediaCacheBridge() {
  const qc = useQueryClient()

  useEffect(() => {
    void ensureMediaIndexLoaded()
    void cleanupUploadTempFiles()

    const cache = qc.getQueryCache()
    const run = () => {
      const queries = cache.findAll({ queryKey: ['messages'] })
      for (const query of queries) {
        // Messages are stored as InfiniteData ({ pages: [{ messages }] }). Was:
        // read as a flat { messages } shape, so this always no-oped.
        const data = coerceMessagesInfiniteData(query.state.data)
        const messages = flattenMessagesPages(data)
        if (messages.length) syncConversationMedia(messages)
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
