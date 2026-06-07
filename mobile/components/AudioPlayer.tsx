import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  PanResponder,
  ActivityIndicator,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useColorScheme } from 'nativewind'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import { useAudioPlayerState } from '@/hooks/useAudioPlayerState'
import { useAudioDuration } from '@/hooks/useAudioDuration'
import { getAudioDuration } from '@/lib/audioDurationCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import { PlaybackSpeedButton } from '@/components/PlaybackSpeedButton'
import { MessageMeta } from '@/components/MessageMeta'
import { Avatar } from '@/components/Avatar'
import { formatDuration } from '@/lib/format'
import type { Message } from '@/types'

const MIN_WIDTH = 296
const WAVE_BARS = 32
const AVATAR = 42
const PROGRESS_BLUE = '#53bdeb'

const BAR_HEIGHTS = Array.from({ length: WAVE_BARS }, (_, i) => {
  const n = (Math.sin(i * 0.55) + Math.sin(i * 0.17)) * 0.5 + 0.5
  return 3 + Math.round(n * 12)
})

function VoiceNoteAvatar({
  name,
  imageUrl,
  outbound,
  micBorderColor,
}: {
  name: string
  imageUrl?: string | null
  outbound: boolean
  micBorderColor: string
}) {
  return (
    <View style={styles.avatarWrap}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatarImage} contentFit="cover" />
      ) : (
        <Avatar name={name} fallback={name} size={AVATAR} />
      )}
      <View
        style={[
          styles.micBadge,
          outbound ? styles.micBadgeOut : styles.micBadgeIn,
          { borderColor: micBorderColor },
        ]}
      >
        <Ionicons name="mic" size={9} color="#ffffff" />
      </View>
    </View>
  )
}

function AvatarSpeedSlot({
  showSpeed,
  outbound,
  avatarName,
  avatarUrl,
  micBorderColor,
}: {
  showSpeed: boolean
  outbound: boolean
  avatarName: string
  avatarUrl?: string | null
  micBorderColor: string
}) {
  const avatarOpacity = useSharedValue(showSpeed ? 0 : 1)
  const speedOpacity = useSharedValue(showSpeed ? 1 : 0)

  useEffect(() => {
    avatarOpacity.value = withTiming(showSpeed ? 0 : 1, { duration: 220 })
    speedOpacity.value = withTiming(showSpeed ? 1 : 0, { duration: 220 })
  }, [showSpeed, avatarOpacity, speedOpacity])

  const avatarStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
    transform: [{ scale: 0.92 + avatarOpacity.value * 0.08 }],
  }))

  const speedStyle = useAnimatedStyle(() => ({
    opacity: speedOpacity.value,
    transform: [{ scale: 0.92 + speedOpacity.value * 0.08 }],
  }))

  return (
    <View style={styles.avatarSlot}>
      <Animated.View style={[styles.avatarLayer, speedStyle]} pointerEvents={showSpeed ? 'auto' : 'none'}>
        <PlaybackSpeedButton variant="avatar" outbound={outbound} visible />
      </Animated.View>
      <Animated.View style={[styles.avatarLayer, avatarStyle]} pointerEvents={showSpeed ? 'none' : 'auto'}>
        <VoiceNoteAvatar
          name={avatarName}
          imageUrl={avatarUrl}
          outbound={outbound}
          micBorderColor={micBorderColor}
        />
      </Animated.View>
    </View>
  )
}

function AudioPlayerBase({
  uri,
  messageId,
  conversationId,
  variant = 'inbound',
  resolvePlaybackUri,
  sentAt,
  status,
  avatarName,
  avatarUrl,
}: {
  uri: string
  messageId: string
  conversationId: string
  variant?: 'inbound' | 'outbound'
  resolvePlaybackUri?: () => Promise<string | null>
  sentAt?: string | null
  status?: Message['status']
  avatarName?: string
  avatarUrl?: string | null
}) {
  const {
    isActive,
    isPlaying,
    showSpeedSlot,
    loading: storeLoading,
    positionMs: storePositionMs,
    durationMs: storeDurationMs,
    session,
  } = useAudioPlayerState(messageId)
  const toggle = useGlobalAudioStore((s) => s.toggle)
  const pause = useGlobalAudioStore((s) => s.pause)
  const seekRatio = useGlobalAudioStore((s) => s.seekRatio)
  const registerTrackResolver = useGlobalAudioStore((s) => s.registerTrackResolver)
  const unregisterTrackResolver = useGlobalAudioStore((s) => s.unregisterTrackResolver)

  const probedDurationMs = useAudioDuration(uri, messageId, !isActive)

  const trackRef = useRef<View>(null)
  const trackWidthRef = useRef(0)
  const trackXRef = useRef(0)
  const durationMsRef = useRef(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubRatio, setScrubRatio] = useState(0)
  const [resolving, setResolving] = useState(false)

  const outbound = variant === 'outbound'
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const playColor = outbound || isDark ? '#ffffff' : '#008069'
  const durationColor = outbound || isDark ? 'rgba(255,255,255,0.65)' : '#667781'
  const waveIdleColor = outbound || isDark ? 'rgba(134, 150, 160, 0.55)' : '#c5cfd6'
  const waveActiveColor = outbound || isDark ? PROGRESS_BLUE : '#008069'
  const micBorderColor = outbound ? '#005c4b' : isDark ? '#202c33' : '#ffffff'

  const durationMs =
    storeDurationMs || probedDurationMs || getAudioDuration(messageId)

  const positionMs = scrubbing ? scrubRatio * durationMs : storePositionMs

  const loading = resolving || storeLoading

  durationMsRef.current = durationMs

  useEffect(() => {
    if (!storeLoading) return
    const timer = setTimeout(() => {
      const state = useGlobalAudioStore.getState()
      if (state.track?.messageId !== messageId) return
      if (state.playback.isLoaded) return
      state.pause()
    }, 12_000)
    return () => clearTimeout(timer)
  }, [storeLoading, messageId])

  const playbackProgress = durationMs > 0 ? positionMs / durationMs : 0
  const displayProgress = scrubbing ? scrubRatio : playbackProgress

  const showElapsed =
    isPlaying || scrubbing || (isActive && positionMs > 0) || (session != null && positionMs > 0)

  const durationLabel = useMemo(() => {
    if (loading && durationMs <= 0) return '…'
    if (durationMs <= 0) return '--:--'
    const total = formatDuration(durationMs / 1000)
    if (!showElapsed) return total
    return `${formatDuration(positionMs / 1000)} / ${total}`
  }, [loading, durationMs, showElapsed, positionMs])

  async function resolveTrack(): Promise<{
    uri: string
    messageId: string
    conversationId: string
    variant: 'inbound' | 'outbound'
  } | null> {
    let playUri: string | null = null
    if (resolvePlaybackUri) {
      const resolved = await resolvePlaybackUri()
      if (resolved) playUri = resolveUploadUri(resolved)
    }
    if (!playUri && uri) playUri = resolveUploadUri(uri)
    if (!playUri) return null
    return { uri: playUri, messageId, conversationId, variant }
  }

  useEffect(() => {
    registerTrackResolver(messageId, resolveTrack)
    return () => unregisterTrackResolver(messageId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, uri, conversationId, variant, registerTrackResolver, unregisterTrackResolver])

  async function onToggle() {
    if (isPlaying) {
      pause()
      return
    }
    setResolving(true)
    try {
      const t = await resolveTrack()
      if (!t) return
      toggle(t)
    } finally {
      setResolving(false)
    }
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
          void onToggle()
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
        if (!session && !isActive) void onToggle()
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
    const width = e.nativeEvent.layout.width
    trackWidthRef.current = width
    trackRef.current?.measure((_x, _y, measuredW, _h, pageX) => {
      trackWidthRef.current = measuredW
      trackXRef.current = pageX
    })
  }

  const sideSlot =
    avatarName != null ? (
      <AvatarSpeedSlot
        showSpeed={showSpeedSlot}
        outbound={outbound}
        avatarName={avatarName}
        avatarUrl={avatarUrl}
        micBorderColor={micBorderColor}
      />
    ) : null

  return (
    <View style={styles.root}>
      {outbound ? sideSlot : null}

      <Pressable
        onPress={() => void onToggle()}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        style={styles.playBtn}
        hitSlop={6}
      >
        {loading ? (
          <ActivityIndicator color={playColor} size="small" />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color={playColor}
            style={{ marginLeft: isPlaying ? 0 : 2 }}
          />
        )}
      </Pressable>

      <View style={styles.waveColumn}>
        <View
          ref={trackRef}
          {...panResponder.panHandlers}
          onLayout={onTrackLayout}
          accessibilityRole="adjustable"
          accessibilityLabel="Audio progress"
          style={styles.waveTrack}
        >
          <View style={styles.waveRow}>
            {BAR_HEIGHTS.map((h, i) => {
              const active = (i + 0.5) / WAVE_BARS <= displayProgress
              return (
                <View
                  key={i}
                  style={[
                    styles.waveBar,
                    { height: h, backgroundColor: active ? waveActiveColor : waveIdleColor },
                  ]}
                />
              )
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.duration, { color: durationColor }]}>{durationLabel}</Text>
          {sentAt ? (
            <MessageMeta
              sentAt={sentAt}
              outbound={outbound}
              status={status}
              messageType="audio"
            />
          ) : null}
        </View>
      </View>

      {!outbound ? sideSlot : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    minWidth: MIN_WIDTH,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  avatarSlot: {
    width: AVATAR,
    height: AVATAR,
    flexShrink: 0,
    marginTop: 2,
  },
  avatarLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
  },
  avatarImage: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  micBadge: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PROGRESS_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  micBadgeOut: {
    bottom: -2,
    right: -2,
  },
  micBadgeIn: {
    bottom: -2,
    left: -2,
  },
  playBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 8,
  },
  waveColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  waveTrack: {
    height: 28,
    justifyContent: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 24,
    gap: 2,
  },
  waveBar: {
    flex: 1,
    maxWidth: 3.5,
    borderRadius: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
    minHeight: 16,
  },
  duration: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
})

export const AudioPlayer = memo(AudioPlayerBase)
