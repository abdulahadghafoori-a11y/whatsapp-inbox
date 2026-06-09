import { useCallback, useEffect, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { setAudioDuration } from '@/lib/audioDurationCache'
import {
  hasPendingAudioDurationProbes,
  takeNextAudioDurationProbe,
} from '@/lib/audioDurationProbe'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'

type ProbeJob = { messageId: string; uri: string }

function AudioDurationProbeRunner({
  job,
  onDone,
}: {
  job: ProbeJob
  onDone: () => void
}) {
  const isRemote =
    job.uri.startsWith('http://') || job.uri.startsWith('https://')
  const player = useAudioPlayer(job.uri, {
    updateInterval: 500,
    // Local file:// probes must not call ExpoAsset.downloadAsync (R2 presign failures).
    downloadFirst: isRemote,
  })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    const failTimer = setTimeout(onDone, 12_000)
    const ms = (status.duration ?? 0) * 1000
    if (ms > 0) {
      clearTimeout(failTimer)
      setAudioDuration(job.messageId, ms)
      onDone()
    }
    return () => clearTimeout(failTimer)
  }, [job.messageId, status.duration, onDone])

  return null
}

/** One background player for duration metadata — never mounted while global voice playback is active. */
export function AudioDurationProbeHost() {
  const track = useGlobalAudioStore((s) => s.track)
  const globalPlayerActive = !!track

  const [job, setJob] = useState<ProbeJob | null>(null)

  const advanceQueue = useCallback(() => {
    setJob(null)
    const next = takeNextAudioDurationProbe()
    if (next) setJob(next)
  }, [])

  useEffect(() => {
    if (globalPlayerActive || job) return
    if (hasPendingAudioDurationProbes()) {
      const next = takeNextAudioDurationProbe()
      if (next) setJob(next)
    }
  }, [globalPlayerActive, job])

  if (globalPlayerActive || !job) return null

  return <AudioDurationProbeRunner key={job.messageId} job={job} onDone={advanceQueue} />
}
