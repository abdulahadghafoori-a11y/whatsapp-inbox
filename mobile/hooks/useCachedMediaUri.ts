import { useSyncExternalStore } from 'react'
import {
  ensureMediaIndexLoaded,
  getCachedMediaUriSync,
  subscribeMessageMediaCache,
} from '@/lib/messageMediaCache'
import { useEffect } from 'react'

let indexBootstrapped = false

function bootstrapIndex() {
  if (indexBootstrapped) return
  indexBootstrapped = true
  void ensureMediaIndexLoaded()
}

/** On-device media path for a message (sync after index load, updates when cache writes). */
export function useCachedMediaUri(messageId: string | undefined) {
  useEffect(() => {
    bootstrapIndex()
  }, [])

  return useSyncExternalStore(
    (listener) => subscribeMessageMediaCache(messageId, listener),
    () => (messageId ? getCachedMediaUriSync(messageId) : null),
    () => null,
  )
}
