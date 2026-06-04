import { useEffect, useState } from 'react'
import { getAudioDuration, subscribeAudioDuration } from '@/lib/audioDurationCache'
import { requestAudioDurationProbe } from '@/lib/audioDurationProbe'

/**
 * Reads cached duration and queues a single shared probe when missing.
 */
export function useAudioDuration(
  uri: string | null | undefined,
  messageId: string,
  enabled: boolean,
): number {
  const [, bump] = useState(0)

  useEffect(() => {
    const unsub = subscribeAudioDuration(() => {
      bump((n) => n + 1)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!enabled || !uri || getAudioDuration(messageId) > 0) return
    requestAudioDurationProbe(messageId, uri)
  }, [uri, messageId, enabled])

  return getAudioDuration(messageId)
}
