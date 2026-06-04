import { resolveUploadUri } from '@/lib/uploadUri'
import { getAudioDuration } from '@/lib/audioDurationCache'

type ProbeJob = { messageId: string; uri: string }

const queue: ProbeJob[] = []

export function requestAudioDurationProbe(messageId: string, uri: string) {
  if (getAudioDuration(messageId) > 0) return
  if (queue.some((j) => j.messageId === messageId)) return
  queue.push({ messageId, uri: resolveUploadUri(uri) })
}

export function takeNextAudioDurationProbe(): ProbeJob | null {
  while (queue.length > 0) {
    const job = queue.shift()!
    if (getAudioDuration(job.messageId) > 0) continue
    return job
  }
  return null
}

export function hasPendingAudioDurationProbes() {
  return queue.length > 0
}
