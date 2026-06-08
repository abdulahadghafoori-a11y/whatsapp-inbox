import { useEffect, useRef, useState } from 'react'
import type { VoiceRecording } from '@/lib/voiceRecording'
import { meteringToLevel } from '@/lib/metering'

const DEFAULT_BARS = 32
const SAMPLE_MS = 65
const IDLE = 0.14

export function useVoiceMetering(
  recorder: VoiceRecording | null,
  active: boolean,
  barCount: number = DEFAULT_BARS,
): number[] {
  const count = Math.max(16, barCount)
  const [levels, setLevels] = useState<number[]>(() => Array(count).fill(IDLE))
  const levelsRef = useRef(levels)
  const smoothed = useRef(IDLE)
  const staleMeteringTicks = useRef(0)

  useEffect(() => {
    if (levelsRef.current.length === count) return
    const idle = Array(count).fill(IDLE)
    levelsRef.current = idle
    smoothed.current = IDLE
    setLevels(idle)
  }, [count])

  useEffect(() => {
    levelsRef.current = levels
  }, [levels])

  useEffect(() => {
    if (!active) {
      staleMeteringTicks.current = 0
      return
    }

    const tick = () => {
      let level = IDLE
      if (recorder) {
        try {
          const status = recorder.getStatus()
          const raw = status.metering
          if (raw == null || Number.isNaN(raw)) {
            staleMeteringTicks.current += 1
          } else {
            staleMeteringTicks.current = 0
            level = meteringToLevel(raw)
          }
        } catch {
          staleMeteringTicks.current += 1
        }
      } else {
        staleMeteringTicks.current = 3
      }

      // Warming pulse while the mic starts, or when metering is missing.
      if (!recorder || staleMeteringTicks.current > 2) {
        const t = Date.now() / 1000
        level = 0.18 + Math.abs(Math.sin(t * 4.2)) * 0.35 + Math.abs(Math.sin(t * 2.1)) * 0.15
      }

      const prevSmooth = smoothed.current
      const next =
        level > prevSmooth
          ? prevSmooth + (level - prevSmooth) * 0.65
          : prevSmooth + (level - prevSmooth) * 0.42
      smoothed.current = next

      const prev = levelsRef.current
      const updated =
        prev.length === count
          ? [...prev.slice(1), next]
          : [...Array(count - 1).fill(IDLE), next]
      levelsRef.current = updated
      setLevels(updated)
    }

    tick()
    const id = setInterval(tick, SAMPLE_MS)
    return () => clearInterval(id)
  }, [active, recorder, count])

  return levels
}
