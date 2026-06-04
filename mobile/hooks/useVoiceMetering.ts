import { useEffect, useRef, useState } from 'react'
import type { VoiceRecording } from '@/lib/voiceRecording'
import { meteringToLevel } from '@/lib/metering'

const DEFAULT_BARS = 32

export function useVoiceMetering(
  recorder: VoiceRecording | null,
  active: boolean,
  barCount: number = DEFAULT_BARS,
): number[] {
  const count = Math.max(16, barCount)
  const [levels, setLevels] = useState<number[]>(() => Array(count).fill(0.12))
  const phase = useRef(0)
  const levelsRef = useRef(levels)

  useEffect(() => {
    const idle = Array(count).fill(0.12)
    levelsRef.current = idle
    setLevels(idle)
    phase.current = 0
  }, [count])

  useEffect(() => {
    levelsRef.current = levels
  }, [levels])

  useEffect(() => {
    if (!active || !recorder) return

    let raf = 0
    const tick = () => {
      let level = 0.12
      try {
        const status = recorder.getStatus()
        level = meteringToLevel(status.metering)
      } catch {
        phase.current += 0.28
        level = 0.12 + Math.abs(Math.sin(phase.current)) * 0.08
      }
      const prev = levelsRef.current
      const next =
        prev.length === count
          ? [...prev.slice(1), level]
          : [...Array(count - 1).fill(0.12), level]
      levelsRef.current = next
      setLevels(next)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, recorder, count])

  return levels
}
