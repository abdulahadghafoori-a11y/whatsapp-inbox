import { useCallback, useEffect, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  interpolate,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import type { AnimatedRef } from 'react-native-reanimated'
import type { FlatList } from 'react-native-gesture-handler'
import type { Message } from '@/types'

const EDGE_INSET = 0
const HIT_WIDTH = 18
const TRACK_WIDTH = 3
const THUMB_WIDTH = 4
const THUMB_HEIGHT = 24
const THUMB_WIDTH_ACTIVE = 10
const THUMB_HEIGHT_ACTIVE = 48
const MIN_MESSAGES = 24

type ChatScrollScrubberProps = {
  listRef: AnimatedRef<FlatList<Message>>
  messages: Message[]
  contentHeight: number
  viewportHeight: number
  scrollY: SharedValue<number>
  maxOffset: SharedValue<number>
  visible: boolean
  onScrubbingChange?: (scrubbing: boolean) => void
  onScrollActivity?: () => void
  onScrollOffset?: (offsetY: number) => void
}

export function ChatScrollScrubber({
  listRef,
  messages,
  contentHeight,
  viewportHeight,
  scrollY,
  maxOffset,
  visible,
  onScrubbingChange,
  onScrollActivity,
  onScrollOffset,
}: ChatScrollScrubberProps) {
  const active = useSharedValue(0)
  const scrubRatio = useSharedValue(1)
  const trackHeight = useSharedValue(0)
  const thumbTravel = useSharedValue(0)
  const uiOpacity = useSharedValue(0)
  const scrollAnim = useSharedValue(0)
  const decaying = useSharedValue(0)

  const maxOffsetJs = Math.max(0, contentHeight - viewportHeight)
  const show =
    messages.length >= MIN_MESSAGES && maxOffsetJs > viewportHeight * 0.35

  useEffect(() => {
    maxOffset.value = maxOffsetJs
  }, [maxOffset, maxOffsetJs])

  useEffect(() => {
    uiOpacity.value = withTiming(visible ? 1 : 0, { duration: visible ? 120 : 280 })
  }, [visible, uiOpacity])

  const setScrubbingJs = useCallback(
    (scrubbing: boolean) => {
      onScrubbingChange?.(scrubbing)
    },
    [onScrubbingChange],
  )

  const bumpActivity = useCallback(() => {
    onScrollActivity?.()
  }, [onScrollActivity])

  const reportOffset = useCallback(
    (offset: number) => {
      onScrollOffset?.(offset)
    },
    [onScrollOffset],
  )

  useAnimatedReaction(
    () => (decaying.value === 1 ? scrollAnim.value : -1),
    (offset) => {
      if (offset < 0) return
      scrollTo(listRef, 0, offset, false)
      scrollY.value = offset
      if (onScrollOffset) runOnJS(reportOffset)(offset)
    },
  )

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          cancelAnimation(scrollAnim)
          decaying.value = 0
          active.value = 1
          uiOpacity.value = 1
          runOnJS(setScrubbingJs)(true)
          runOnJS(bumpActivity)()
          const h = trackHeight.value
          const ratio = h > 0 ? Math.min(1, Math.max(0, e.y / h)) : 0
          scrubRatio.value = ratio
          const max = maxOffset.value
          if (max > 0) {
            const offset = (1 - ratio) * max
            scrollY.value = offset
            scrollTo(listRef, 0, offset, false)
            if (onScrollOffset) runOnJS(reportOffset)(offset)
          }
        })
        .onUpdate((e) => {
          const h = trackHeight.value
          const ratio = h > 0 ? Math.min(1, Math.max(0, e.y / h)) : 0
          scrubRatio.value = ratio
          const max = maxOffset.value
          if (max > 0) {
            const offset = (1 - ratio) * max
            scrollY.value = offset
            scrollTo(listRef, 0, offset, false)
            if (onScrollOffset) runOnJS(reportOffset)(offset)
          }
        })
        .onEnd((e) => {
          active.value = 0
          runOnJS(setScrubbingJs)(false)
          runOnJS(bumpActivity)()

          const max = maxOffset.value
          const h = trackHeight.value
          if (max <= 0 || h <= 0) return

          const scrollVel = (-e.velocityY / h) * max
          if (Math.abs(scrollVel) < 40) return

          decaying.value = 1
          scrollAnim.value = scrollY.value
          scrollAnim.value = withDecay(
            {
              velocity: scrollVel,
              deceleration: 0.998,
              clamp: [0, max],
            },
            (finished) => {
              if (finished) {
                decaying.value = 0
                runOnJS(bumpActivity)()
              }
            },
          )
        })
        .onFinalize(() => {
          active.value = 0
          runOnJS(setScrubbingJs)(false)
        }),
    [
      active,
      bumpActivity,
      decaying,
      listRef,
      maxOffset,
      onScrollOffset,
      reportOffset,
      scrollAnim,
      scrollY,
      scrubRatio,
      setScrubbingJs,
      trackHeight,
      uiOpacity,
    ],
  )

  const thumbTop = useDerivedValue(() => {
    const travel = thumbTravel.value
    if (travel <= 0) return 0
    const max = maxOffset.value
    const ratio =
      active.value > 0
        ? scrubRatio.value
        : max > 0
          ? 1 - Math.min(1, Math.max(0, scrollY.value / max))
          : 1
    const thumbH = active.value > 0 ? THUMB_HEIGHT_ACTIVE : THUMB_HEIGHT
    return Math.max(0, travel * ratio - (active.value > 0 ? (thumbH - THUMB_HEIGHT) / 2 : 0))
  })

  const trackStyle = useAnimatedStyle(() => ({
    opacity: uiOpacity.value * (active.value > 0 ? 0.38 : 0.16),
  }))

  const thumbStyle = useAnimatedStyle(() => {
    const grabbed = active.value
    const w = interpolate(grabbed, [0, 1], [THUMB_WIDTH, THUMB_WIDTH_ACTIVE])
    const h = interpolate(grabbed, [0, 1], [THUMB_HEIGHT, THUMB_HEIGHT_ACTIVE])
    return {
      top: thumbTop.value,
      width: w,
      height: h,
      right: (HIT_WIDTH - w) / 2,
      opacity: uiOpacity.value * (grabbed > 0 ? 1 : 0.5),
    }
  })

  if (!show) return null

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={styles.hitStrip}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height
          trackHeight.value = h
          thumbTravel.value = Math.max(0, h - THUMB_HEIGHT_ACTIVE)
        }}
        collapsable={false}
      >
        <Animated.View style={[styles.trackLine, trackStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hitStrip: {
    position: 'absolute',
    right: EDGE_INSET,
    top: 0,
    bottom: 0,
    width: HIT_WIDTH,
    zIndex: 40,
  },
  trackLine: {
    position: 'absolute',
    right: (HIT_WIDTH - TRACK_WIDTH) / 2,
    top: 20,
    bottom: 20,
    width: TRACK_WIDTH,
    borderRadius: 2,
    backgroundColor: 'rgba(18,140,126,1)',
  },
  thumb: {
    position: 'absolute',
    borderRadius: 8,
    backgroundColor: 'rgba(18,140,126,0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
})
