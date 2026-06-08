import { resolveUploadUri } from '@/lib/uploadUri'
import { getAudioDuration } from '@/lib/audioDurationCache'
import { getCachedMediaUriSync } from '@/lib/messageMediaCache'

type ProbeJob = { messageId: string; uri: string }

const queue: ProbeJob[] = []

export function requestAudioDurationProbe(messageId: string, uri: string) {
  if (getAudioDuration(messageId) > 0) return
  if (queue.some((j) => j.messageId === messageId)) return
  queue.push({ messageId, uri })
}

export function takeNextAudioDurationProbe(): ProbeJob | null {
  while (queue.length > 0) {
    const job = queue.shift()!
    if (getAudioDuration(job.messageId) > 0) continue
    // Prefer the on-device blob if it's already cached so the probe never
    // re-downloads a copy that the media pipeline has (or will have) stored.
    const cached = getCachedMediaUriSync(job.messageId)
    return { messageId: job.messageId, uri: resolveUploadUri(cached ?? job.uri) }
  }
  return null
}

export function hasPendingAudioDurationProbes() {
  return queue.length > 0
}
