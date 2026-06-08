import { useSyncExternalStore } from 'react'
import {
  isMessageMediaActive,
  subscribeMessageMediaActive,
} from '@/lib/visibleMessageMedia'

/** True when this message row is in the FlatList viewport (media may load). */
export function useMessageMediaActive(messageId: string | undefined): boolean {
  return useSyncExternalStore(
    (cb) => subscribeMessageMediaActive(messageId, cb),
    () => isMessageMediaActive(messageId),
    () => false,
  )
}
