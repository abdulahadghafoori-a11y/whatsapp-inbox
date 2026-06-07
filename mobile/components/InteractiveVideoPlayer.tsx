import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { VideoSeekBar } from '@/components/VideoSeekBar'
import { SwipeDismissContainer } from '@/components/SwipeDismissContainer'
import { formatDuration } from '@/lib/format'
import { resolveUploadUri } from '@/lib/uploadUri'

type InteractiveVideoPlayerProps = {
  url: string
  style?: StyleProp<ViewStyle>
  fill?: boolean
  expanded?: boolean
  compact?: boolean
  /** Start playback when mounted (fullscreen open). */
  autoPlay?: boolean
  /** Loop playback inside this range (trim preview). */
  playbackRange?: { startMs: number; endMs: number }
  /** Swipe down on the video area (not the control bar) to dismiss. */
  onSwipeDismiss?: () => void
}

const CONTROLS_HEIGHT_EXPANDED = 76
const CONTROLS_HEIGHT_DEFAULT = 60

export function InteractiveVideoPlayer({
  url,
  style,
  fill = false,
  expanded = false,
  compact = false,
  autoPlay = false,
  playbackRange,
  onSwipeDismiss,
}: InteractiveVideoPlayerProps) {
  const source = resolveUploadUri(url)
  const rangeStartSec = (playbackRange?.startMs ?? 0) / 1000
  const rangeEndSec = (playbackRange?.endMs ?? 0) / 1000
  const hasRange = playbackRange != null && rangeEndSec > rangeStartSec
  const rangeDurationSec = hasRange ? rangeEndSec - rangeStartSec : 0

  const player = useVideoPlayer(source, (p) => {
    p.loop = false
  })

  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [scrubPreview, setScrubPreview] = useState<number | null>(null)
  const scrubPreviewRef = useRef<number | null>(null)
  const wasPlayingRef = useRef(false)
  const scrubbingRef = useRef(false)

  const controlsHeight = expanded ? CONTROLS_HEIGHT_EXPANDED : CONTROLS_HEIGHT_DEFAULT

  useEffect(() => {
    const id = setInterval(() => {
      if (scrubbingRef.current) return
      try {
        const current = player.currentTime
        if (hasRange) {
          if (current >= rangeEndSec - 0.05) {
            player.currentTime = rangeStartSec
            if (!player.playing) void player.play()
          } else if (current < rangeStartSec - 0.05) {
            player.currentTime = rangeStartSec
          }
          setPosition(Math.max(0, player.currentTime - rangeStartSec))
          setDuration(rangeDurationSec)
        } else {
          setPosition(current)
          const d = player.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }
        setPlaying(player.playing)
      } catch {
        // player released
      }
    }, 100)
    return () => clearInterval(id)
  }, [player, hasRange, rangeStartSec, rangeEndSec, rangeDurationSec])

  useEffect(() => {
    if (!hasRange) return
    try {
      player.currentTime = rangeStartSec
    } catch {
      // player not ready
    }
  }, [player, hasRange, rangeStartSec, playbackRange?.startMs, playbackRange?.endMs])

  useEffect(() => {
    if (!autoPlay || compact) return
    let cancelled = false
    const id = setInterval(() => {
      if (cancelled) return
      try {
        const ready = hasRange
          ? rangeDurationSec > 0
          : Number.isFinite(player.duration) && player.duration > 0
        if (ready) {
          if (hasRange) player.currentTime = rangeStartSec
          if (!player.playing) {
            player.play()
            setPlaying(true)
          }
          clearInterval(id)
        }
      } catch {
        // player not ready
      }
    }, 80)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [autoPlay, compact, player, source, hasRange, rangeStartSec, rangeDurationSec])

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.play()
      setPlaying(true)
    }
  }, [player])

  const commitSeek = useCallback(
    (ratio: number) => {
      if (!duration || duration <= 0) return
      const clamped = Math.min(1, Math.max(0, ratio))
      const next = hasRange
        ? rangeStartSec + clamped * rangeDurationSec
        : clamped * duration
      try {
        player.currentTime = next
        setPosition(hasRange ? next - rangeStartSec : next)
      } catch {
        setPosition(hasRange ? next - rangeStartSec : next)
      }
    },
    [duration, player, hasRange, rangeStartSec, rangeDurationSec],
  )

  const onSeekRatioDuringScrub = useCallback(
    (ratio: number) => {
      if (!duration || duration <= 0) return
      const clamped = Math.min(1, Math.max(0, ratio))
      const seconds = hasRange
        ? clamped * rangeDurationSec
        : clamped * duration
      scrubPreviewRef.current = seconds
      setScrubPreview(seconds)
    },
    [duration, hasRange, rangeDurationSec],
  )

  const onScrubStart = useCallback(() => {
    scrubbingRef.current = true
    wasPlayingRef.current = player.playing
    if (player.playing) {
      try {
        player.pause()
      } catch {
        // ignore
      }
    }
  }, [player])

  const onScrubEnd = useCallback(() => {
    scrubbingRef.current = false
    const preview = scrubPreviewRef.current
    scrubPreviewRef.current = null
    if (preview != null && duration > 0) {
      commitSeek(preview / duration)
    }
    setScrubPreview(null)
    if (wasPlayingRef.current) {
      try {
        player.play()
      } catch {
        // ignore
      }
    }
  }, [commitSeek, duration, player])

  const displayPosition = scrubPreview ?? position
  const progress = duration > 0 ? Math.min(1, displayPosition / duration) : 0

  const videoBody = (
    <>
      <VideoView
        player={player}
        style={styles.videoFill}
        contentFit={compact ? 'cover' : 'contain'}
        nativeControls={false}
      />

      {compact ? (
        <View pointerEvents="none" style={styles.tapLayer}>
          <View style={styles.playBtn}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      ) : !playing && scrubPreview == null ? (
        <Pressable
          onPress={togglePlay}
          style={styles.tapLayer}
          accessibilityRole="button"
          accessibilityLabel="Play video"
        >
          <View style={[styles.playBtn, expanded && styles.playBtnLarge]}>
            <Text style={[styles.playIcon, expanded && styles.playIconLarge]}>▶</Text>
          </View>
        </Pressable>
      ) : null}
    </>
  )

  return (
    <View style={[fill ? styles.fill : styles.wrap, style]}>
      <View style={[styles.videoStage, { marginBottom: compact ? 0 : controlsHeight }]}>
        {onSwipeDismiss && !compact ? (
          <SwipeDismissContainer onDismiss={onSwipeDismiss} style={styles.videoStageInner}>
            {videoBody}
          </SwipeDismissContainer>
        ) : (
          <View style={styles.videoStageInner}>{videoBody}</View>
        )}
      </View>

      {!compact ? (
        <View
          style={[styles.controls, expanded && styles.controlsExpanded]}
          collapsable={false}
        >
          <Pressable onPress={togglePlay} hitSlop={16} style={styles.controlBtn}>
            <Text style={styles.controlIcon}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>

          <Text style={styles.time}>{formatDuration(displayPosition)}</Text>

          <View style={styles.seekSlot}>
            <VideoSeekBar
              progress={progress}
              onSeekRatio={onSeekRatioDuringScrub}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              expanded={expanded}
            />
          </View>

          <Text style={styles.time}>
            {duration > 0 ? formatDuration(duration) : '0:00'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#000',
    minHeight: 160,
  },
  fill: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoStage: {
    flex: 1,
    position: 'relative',
  },
  videoStageInner: {
    flex: 1,
    position: 'relative',
  },
  videoFill: {
    ...StyleSheet.absoluteFillObject,
  },
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  playBtnLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  playIcon: {
    color: '#fff',
    fontSize: 22,
    marginLeft: 4,
  },
  playIconLarge: {
    fontSize: 28,
    marginLeft: 5,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 20,
  },
  controlsExpanded: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    gap: 8,
  },
  controlBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 38,
    textAlign: 'center',
  },
  seekSlot: {
    flex: 1,
    minWidth: 80,
  },
})
