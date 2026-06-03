import { useEffect, useRef } from 'react'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { safePause, safePlay } from '@/lib/safeAudioPlayer'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'

function GlobalAudioPlayerInner({ uri }: { uri: string }) {
  const wantPlaying = useGlobalAudioStore((s) => s.wantPlaying)
  const playbackRate = useGlobalAudioStore((s) => s.playbackRate)
  const bindPlayer = useGlobalAudioStore((s) => s.bindPlayer)
  const setPlayback = useGlobalAudioStore((s) => s.setPlayback)
  const applyPlaybackRateToPlayer = useGlobalAudioStore((s) => s.applyPlaybackRateToPlayer)
  const finishPlayback = useGlobalAudioStore((s) => s.finishPlayback)
  const didSeekOnLoad = useRef(false)

  const player = useAudioPlayer(uri, { updateInterval: 150 })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    didSeekOnLoad.current = false
  }, [uri])

  useEffect(() => {
    bindPlayer(player)
    return () => bindPlayer(null)
  }, [player, bindPlayer])

  useEffect(() => {
    if (status.isLoaded) applyPlaybackRateToPlayer()
  }, [status.isLoaded, playbackRate, player, applyPlaybackRateToPlayer])

  useEffect(() => {
    if (!status.isLoaded || didSeekOnLoad.current) return
    const resumeAt = useGlobalAudioStore.getState().engagedSession?.positionMs
    if (resumeAt && resumeAt > 0 && !status.playing) {
      didSeekOnLoad.current = true
      void player.seekTo(resumeAt / 1000)
    }
  }, [status.isLoaded, status.playing, player])

  useEffect(() => {
    const prev = useGlobalAudioStore.getState().playback
    const durationMs = (status.duration ?? 0) * 1000
    const positionMs = (status.currentTime ?? 0) * 1000

    setPlayback({
      isPlaying: status.playing,
      isLoaded: status.isLoaded || prev.isLoaded,
      durationMs: durationMs > 0 ? durationMs : prev.durationMs,
      positionMs: positionMs > 0 ? positionMs : prev.positionMs,
      didJustFinish: status.didJustFinish,
    })
  }, [
    status.playing,
    status.isLoaded,
    status.duration,
    status.currentTime,
    status.didJustFinish,
    setPlayback,
  ])

  useEffect(() => {
    if (!wantPlaying || !status.isLoaded) return

    const atEnd =
      status.didJustFinish ||
      (status.duration > 0 && status.currentTime >= status.duration - 0.15)

    if (atEnd) {
      safePause(player)
      finishPlayback()
      return
    }

    if (!status.playing) safePlay(player)
  }, [
    wantPlaying,
    status.isLoaded,
    status.playing,
    status.didJustFinish,
    status.duration,
    status.currentTime,
    player,
    finishPlayback,
  ])

  useEffect(() => {
    if (!wantPlaying && status.playing) safePause(player)
  }, [wantPlaying, status.playing, player])

  return null
}

/** Single app-wide audio player so playback continues when leaving a chat. */
export function GlobalAudioHost() {
  const track = useGlobalAudioStore((s) => s.track)

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true })
  }, [])

  if (!track?.uri) return null
  return <GlobalAudioPlayerInner key={track.messageId} uri={track.uri} />
}
