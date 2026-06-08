import { useEffect, useState } from 'react'
import {
  evaluateAutoDownload,
  evaluateAutoDownloadSync,
  type MediaAutoDownloadInput,
} from '@/lib/mediaAutoDownload'
import { subscribeMediaDownloadPrefs } from '@/lib/mediaDownloadPrefs'

/** Re-evaluates Storage & data policy when settings or network context may change. */
export function useMediaAutoDownload(message: MediaAutoDownloadInput & { id?: string }) {
  // Seed synchronously from warm caches so already-decided bubbles never flash a
  // placeholder; only fall back to null (loading) when caches are genuinely cold.
  const seed = evaluateAutoDownloadSync(message)
  const [allowed, setAllowed] = useState<boolean | null>(seed ? seed.allowed : null)
  const [blockReason, setBlockReason] = useState<string | null>(seed?.blockReason ?? null)
  const [tick, setTick] = useState(0)

  useEffect(() => subscribeMediaDownloadPrefs(() => setTick((t) => t + 1)), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { allowed: ok, blockReason: reason } = await evaluateAutoDownload(message)
      if (!cancelled) {
        setAllowed(ok)
        setBlockReason(reason)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [message.type, message.direction, tick])

  return { allowed, blockReason, refresh: () => setTick((t) => t + 1) }
}
