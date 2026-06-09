const THUMBHASH_GAP_MS = 500
const thumbhashQueue: Array<() => Promise<void>> = []
let thumbhashInFlight = false
let thumbhashGapTimer: ReturnType<typeof setTimeout> | null = null

function drainThumbhashQueue(): void {
  if (thumbhashInFlight || thumbhashQueue.length === 0) return
  const job = thumbhashQueue.shift()!
  thumbhashInFlight = true
  void job().finally(() => {
    thumbhashInFlight = false
    thumbhashGapTimer = setTimeout(() => {
      thumbhashGapTimer = null
      drainThumbhashQueue()
    }, THUMBHASH_GAP_MS)
  })
}

/** Run thumbhash generation one at a time with a gap between starts. */
export function scheduleThumbhashGeneration(job: () => Promise<void>): void {
  thumbhashQueue.push(job)
  drainThumbhashQueue()
}
