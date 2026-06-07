import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getActiveConversationId } from '@/lib/activeConversation'
import {
  cleanupUploadTempFiles,
  ensureMediaIndexLoaded,
} from '@/lib/messageMediaCache'
import { syncConversationMedia } from '@/lib/messageMediaSync'
import {
  coerceMessagesInfiniteData,
  flattenMessagesPages,
} from '@/lib/messagesQueryCache'

const SYNC_DEBOUNCE_MS = 1200

/**
 * Background on-device cache for the open chat only (debounced, capped).
 * Was: synced every cached conversation on every messages query update.
 */
export function MediaCacheBridge() {
  const qc = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelSyncRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void ensureMediaIndexLoaded()
    void cleanupUploadTempFiles()

    const cache = qc.getQueryCache()

    const runForActiveConversation = () => {
      const conversationId = getActiveConversationId()
      if (!conversationId) return

      const query = cache.find({ queryKey: ['messages', conversationId] })
      const data = coerceMessagesInfiniteData(query?.state.data)
      const messages = flattenMessagesPages(data)
      if (!messages.length) return

      cancelSyncRef.current?.()
      cancelSyncRef.current = syncConversationMedia(messages, { maxItems: 20 })
    }

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(runForActiveConversation, SYNC_DEBOUNCE_MS)
    }

    runForActiveConversation()

    const unsub = cache.subscribe((event) => {
      if (event?.type !== 'updated' || event.query.queryKey[0] !== 'messages') return
      const conversationId = event.query.queryKey[1]
      if (conversationId !== getActiveConversationId()) return
      schedule()
    })

    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      cancelSyncRef.current?.()
    }
  }, [qc])

  return null
}
