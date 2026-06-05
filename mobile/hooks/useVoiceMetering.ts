import { useEffect, useRef, useState } from 'react'
import type { VoiceRecording } from '@/lib/voiceRecording'
import { meteringToLevel } from '@/lib/metering'

const DEFAULT_BARS = 32
/**
 * One bar per ~65ms. WhatsApp scrolls the live waveform at roughly this rate,
 * so each bar maps to a consistent slice of speech — that's what makes it read
 * as "in sync" with your voice (vs. one bar per render frame, which scrolls
 * ~4x too fast and looks like noise).
 */
const SAMPLE_MS = 65
const IDLE = 0.12

export function useVoiceMetering(
  recorder: VoiceRecording | null,
  active: boolean,
  barCount: number = DEFAULT_BARS,
): number[] {
  const count = Math.max(16, barCount)
  const [levels, setLevels] = useState<number[]>(() => Array(count).fill(IDLE))
  const levelsRef = useRef(levels)
  const smoothed = useRef(IDLE)

  useEffect(() => {
    const idle = Array(count).fill(IDLE)
    levelsRef.current = idle
    smoothed.current = IDLE
    setLevels(idle)
  }, [count])

  useEffect(() => {
    levelsRef.current = levels
  }, [levels])

  useEffect(() => {
    if (!active || !recorder) return

    const tick = () => {
      let level = IDLE
      try {
        const status = recorder.getStatus()
        level = meteringToLevel(status.metering)
      } catch {
        level = IDLE
      }
      // Light attack/decay smoothing keeps the trace fluid instead of jittery.
      const prevSmooth = smoothed.current
      const next = level > prevSmooth ? prevSmooth + (level - prevSmooth) * 0.6 : prevSmooth + (level - prevSmooth) * 0.4
      smoothed.current = next

      const prev = levelsRef.current
      const updated =
        prev.length === count
          ? [...prev.slice(1), next]
          : [...Array(count - 1).fill(IDLE), next]
      levelsRef.current = updated
      setLevels(updated)
    }

    const id = setInterval(tick, SAMPLE_MS)
    return () => clearInterval(id)
  }, [active, recorder, count])

  return levels
}
