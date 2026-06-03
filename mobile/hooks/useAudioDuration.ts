import { useEffect } from 'react'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { getAudioDuration, setAudioDuration } from '@/lib/audioDurationCache'

/**
 * Loads duration metadata without starting playback.
 * Disabled while this message uses the global player (isActive).
 */
export function useAudioDuration(
  uri: string,
  messageId: string,
  enabled: boolean,
): number {
  const cached = getAudioDuration(messageId)
  const shouldProbe = enabled && cached <= 0
  const player = useAudioPlayer(shouldProbe ? uri : null, { updateInterval: 2000 })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    const ms = (status.duration ?? 0) * 1000
    if (ms > 0) setAudioDuration(messageId, ms)
  }, [status.duration, messageId])

  if (cached > 0) return cached
  const live = (status.duration ?? 0) * 1000
  return live > 0 ? live : 0
}
