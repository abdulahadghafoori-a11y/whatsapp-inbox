import { useEffect } from 'react'
import {
  cleanupUploadTempFiles,
  ensureMediaIndexLoaded,
} from '@/lib/messageMediaCache'

/**
 * One-time media subsystem warm-up. Per-thread prefetch of visible media is
 * driven directly by the chat list's viewport callback (syncVisibleMessageMedia),
 * so this no longer needs to observe a query cache.
 */
export function MediaCacheBridge() {
  useEffect(() => {
    void ensureMediaIndexLoaded()
    void cleanupUploadTempFiles()
  }, [])

  return null
}
