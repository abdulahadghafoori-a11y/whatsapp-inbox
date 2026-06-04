import { appStorage } from '@/lib/appStorage'

const STORAGE_KEY = 'wa-audio-durations-v1'

/** Cached voice-note durations (ms) keyed by message id. */
const byMessageId = new Map<string, number>()
const listeners = new Set<() => void>()
let hydrated = false
let hydratePromise: Promise<void> | null = null

async function hydrate() {
  if (hydrated) return
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const raw = await appStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, number>
          for (const [id, ms] of Object.entries(parsed)) {
            if (ms > 0) byMessageId.set(id, ms)
          }
        } catch {
          // ignore corrupt cache
        }
      }
      hydrated = true
    })()
  }
  await hydratePromise
}

void hydrate()

function persist() {
  const obj: Record<string, number> = {}
  byMessageId.forEach((ms, id) => {
    if (ms > 0) obj[id] = ms
  })
  void appStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
}

export function subscribeAudioDuration(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAudioDuration(messageId: string): number {
  return byMessageId.get(messageId) ?? 0
}

export function setAudioDuration(messageId: string, durationMs: number) {
  if (durationMs <= 0) return
  const prev = byMessageId.get(messageId)
  if (prev === durationMs) return
  byMessageId.set(messageId, durationMs)
  persist()
  listeners.forEach((l) => l())
}
