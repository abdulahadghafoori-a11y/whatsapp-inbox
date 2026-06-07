import { useCallback, useSyncExternalStore } from 'react'

let tickMs = Date.now()
let intervalId: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function ensureInterval() {
  if (intervalId != null) return
  intervalId = setInterval(() => {
    tickMs = Date.now()
    for (const listener of listeners) listener()
  }, 1000)
}

function stopIntervalIfIdle() {
  if (listeners.size === 0 && intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  ensureInterval()
  return () => {
    listeners.delete(listener)
    stopIntervalIfIdle()
  }
}

function getSnapshot() {
  return tickMs
}

const noopSubscribe = () => () => {}

/** One shared 1s clock for countdown UIs (avoids per-component setInterval loops). */
export function useSecondTick(enabled: boolean): number {
  const subscribeFn = useCallback(
    (onStoreChange: () => void) => (enabled ? subscribe(onStoreChange) : noopSubscribe()),
    [enabled],
  )
  return useSyncExternalStore(subscribeFn, getSnapshot, getSnapshot)
}
