const BURST_WINDOW_MS = 2000
const BURST_DURATION_MS = 5000
const BURST_THRESHOLD = 4

let burstUntil = 0
let recentSignals: number[] = []
const endListeners = new Set<() => void>()

export function noteInboundMessageSignal(): void {
  const now = Date.now()
  recentSignals = recentSignals.filter((t) => now - t < BURST_WINDOW_MS)
  recentSignals.push(now)
  if (recentSignals.length >= BURST_THRESHOLD) {
    burstUntil = now + BURST_DURATION_MS
  }
}

export function isBurstMode(): boolean {
  return Date.now() < burstUntil
}

export function getBurstAutoscrollThreshold(): number {
  return isBurstMode() ? 300 : 10
}

export function onBurstModeEnd(listener: () => void): () => void {
  endListeners.add(listener)
  return () => endListeners.delete(listener)
}

export function pollBurstModeEnd(): void {
  if (!isBurstMode()) {
    endListeners.forEach((l) => l())
  }
}
