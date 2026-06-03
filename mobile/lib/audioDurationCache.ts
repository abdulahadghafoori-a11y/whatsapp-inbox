/** Cached voice-note durations (ms) keyed by message id. */
const byMessageId = new Map<string, number>()

export function getAudioDuration(messageId: string): number {
  return byMessageId.get(messageId) ?? 0
}

export function setAudioDuration(messageId: string, durationMs: number) {
  if (durationMs > 0) byMessageId.set(messageId, durationMs)
}
