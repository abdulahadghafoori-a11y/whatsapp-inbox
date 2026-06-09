import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  cleanupUploadTempFiles,
  ensureMediaIndexLoaded,
} from '@/lib/messageMediaCache'
import { setMediaSyncQueryClient } from '@/lib/messageMediaSync'

/**
 * One-time media subsystem warm-up. Per-thread prefetch of visible media is
 * driven directly by the chat list's viewport callback (syncVisibleMessageMedia),
 * so this no longer needs to observe a query cache.
 */
export function MediaCacheBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    setMediaSyncQueryClient(queryClient)
    return () => setMediaSyncQueryClient(null)
  }, [queryClient])

  useEffect(() => {
    void ensureMediaIndexLoaded()
    void cleanupUploadTempFiles()
  }, [])

  return null
}
