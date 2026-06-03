import { useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import { useAudioDuration } from '@/hooks/useAudioDuration'
import { getAudioDuration } from '@/lib/audioDurationCache'
import { PlaybackSpeedButton } from '@/components/PlaybackSpeedButton'
import { formatDuration } from '@/lib/format'

const MIN_WIDTH = 268
const WAVE_BARS = 36

const BAR_HEIGHTS = Array.from({ length: WAVE_BARS }, (_, i) => {
  const n = (Math.sin(i * 0.55) + Math.sin(i * 0.17)) * 0.5 + 0.5
  return 3 + Math.round(n * 11)
})

export function AudioPlayer({
  uri,
  messageId,
  conversationId,
  variant = 'inbound',
}: {
  uri: string
  messageId: string
  conversationId: string
  variant?: 'inbound' | 'outbound'
}) {
  const track = useGlobalAudioStore((s) => s.track)
  const engagedSession = useGlobalAudioStore((s) => s.engagedSession)
  const wantPlaying = useGlobalAudioStore((s) => s.wantPlaying)
  const playback = useGlobalAudioStore((s) => s.playback)
  const toggle = useGlobalAudioStore((s) => s.toggle)
  const pause = useGlobalAudioStore((s) => s.pause)
  const seekRatio = useGlobalAudioStore((s) => s.seekRatio)

  const session = engagedSession?.messageId === messageId ? engagedSession : null
  const isActive = track?.messageId === messageId
  const probedDurationMs = useAudioDuration(uri, messageId, !isActive && !session)

  const trackRef = useRef<View>(null)
  const trackWidthRef = useRef(0)
  const trackXRef = useRef(0)
  const durationMsRef = useRef(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubRatio, setScrubRatio] = useState(0)

  const playBg = variant === 'outbound' ? 'bg-wa-dark' : 'bg-wa-teal'
  const waveActive = variant === 'outbound' ? 'bg-wa-dark/75' : 'bg-wa-teal'
  const waveIdle = variant === 'outbound' ? 'bg-wa-dark/20' : 'bg-neutral-300'

  const durationMs =
    session?.durationMs ||
    (isActive ? playback.durationMs : 0) ||
    probedDurationMs ||
    getAudioDuration(messageId)

  const positionMs = scrubbing
    ? scrubRatio * durationMs
    : session
      ? isActive
        ? playback.positionMs
        : session.positionMs
      : isActive
        ? playback.positionMs
        : 0

  const isPlaying = isActive && (wantPlaying || playback.isPlaying)
  const loading = isActive && wantPlaying && !playback.isLoaded && durationMs <= 0
  const hasStarted = !!session || isPlaying || positionMs > 300

  durationMsRef.current = durationMs

  const playbackProgress = durationMs > 0 ? positionMs / durationMs : 0
  const displayProgress = scrubbing ? scrubRatio : playbackProgress

  const timeLabel = useMemo(() => {
    if (loading) return '…'
    if (durationMs <= 0) return '--:--'
    if (hasStarted || positionMs > 0) return formatDuration(positionMs / 1000)
    return formatDuration(durationMs / 1000)
  }, [loading, durationMs, positionMs, hasStarted])

  function onToggle() {
    if (isPlaying) {
      pause()
      return
    }
    toggle({ uri, messageId, conversationId, variant })
  }

  function ratioFromPageX(pageX: number) {
    const w = trackWidthRef.current
    if (w <= 0) return 0
    const localX = pageX - trackXRef.current
    return Math.max(0, Math.min(1, localX / w))
  }

  function setScrubFromPageX(pageX: number) {
    setScrubRatio(ratioFromPageX(pageX))
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => durationMsRef.current > 0,
      onMoveShouldSetPanResponder: () => durationMsRef.current > 0,
      onPanResponderGrant: (evt) => {
        if (!session && !isActive) {
          toggle({ uri, messageId, conversationId, variant })
        }
        setScrubbing(true)
        setScrubFromPageX(evt.nativeEvent.pageX)
      },
      onPanResponderMove: (evt) => {
        setScrubFromPageX(evt.nativeEvent.pageX)
      },
      onPanResponderRelease: (evt) => {
        const ratio = ratioFromPageX(evt.nativeEvent.pageX)
        setScrubbing(false)
        if (!session && !isActive) toggle({ uri, messageId, conversationId, variant })
        seekRatio(ratio)
      },
      onPanResponderTerminate: (evt) => {
        const ratio = ratioFromPageX(evt.nativeEvent.pageX)
        setScrubbing(false)
        seekRatio(ratio)
      },
    }),
  ).current

  function onTrackLayout(e: LayoutChangeEvent) {
    trackWidthRef.current = e.nativeEvent.layout.width
    trackRef.current?.measure((_x, _y, width, _h, pageX) => {
      trackWidthRef.current = width
      trackXRef.current = pageX
    })
  }

  return (
    <View
      style={{ minWidth: MIN_WIDTH, height: 40 }}
      className="w-full flex-row items-center gap-2.5"
    >
      <Pressable
        onPress={onToggle}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        className={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${playBg}`}
      >
        {loading ? (
          <Text className="text-xs text-white">…</Text>
        ) : (
          <Text className="ml-0.5 text-[13px] text-white">{isPlaying ? '❚❚' : '▶'}</Text>
        )}
      </Pressable>

      <View
        ref={trackRef}
        {...panResponder.panHandlers}
        onLayout={onTrackLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Audio progress"
        className="h-9 flex-1 flex-row items-center gap-[2px]"
      >
        {BAR_HEIGHTS.map((h, i) => {
          const active = (i + 0.5) / WAVE_BARS <= displayProgress
          return (
            <View
              key={i}
              style={{ height: h }}
              className={`flex-1 max-w-[4px] rounded-full ${active ? waveActive : waveIdle}`}
            />
          )
        })}
      </View>

      <PlaybackSpeedButton variant="bubble" />

      <Text className="min-w-[34px] text-right text-[12px] tabular-nums text-neutral-600">
        {timeLabel}
      </Text>
    </View>
  )
}
