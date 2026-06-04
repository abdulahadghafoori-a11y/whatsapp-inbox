import { useCallback, useRef, useState } from 'react'
import { View, StyleSheet, PanResponder } from 'react-native'

const THUMB_SIZE = 16
const THUMB_SIZE_ACTIVE = 22
const TRACK_HEIGHT = 4
const TRACK_HEIGHT_ACTIVE = 5

export function VideoSeekBar({
  progress,
  onSeekRatio,
  onScrubStart,
  onScrubEnd,
  expanded = false,
}: {
  progress: number
  onSeekRatio: (ratio: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  expanded?: boolean
}) {
  const hitRef = useRef<View>(null)
  const trackBoundsRef = useRef({ pageX: 0, width: 0 })
  const scrubbingRef = useRef(false)
  const onSeekRatioRef = useRef(onSeekRatio)
  const onScrubStartRef = useRef(onScrubStart)
  const onScrubEndRef = useRef(onScrubEnd)
  onSeekRatioRef.current = onSeekRatio
  onScrubStartRef.current = onScrubStart
  onScrubEndRef.current = onScrubEnd

  const [scrubbing, setScrubbing] = useState(false)
  const [dragProgress, setDragProgress] = useState<number | null>(null)

  const measureTrack = useCallback(() => {
    hitRef.current?.measureInWindow((pageX, _y, width) => {
      trackBoundsRef.current = { pageX, width }
    })
  }, [])

  const ratioFromPageX = useCallback((pageX: number) => {
    const { pageX: left, width } = trackBoundsRef.current
    if (width <= 0) return 0
    return Math.min(1, Math.max(0, (pageX - left) / width))
  }, [])

  const applyRatio = useCallback((ratio: number) => {
    const clamped = Math.min(1, Math.max(0, ratio))
    setDragProgress(clamped)
    onSeekRatioRef.current(clamped)
  }, [])

  const measureTrackRef = useRef(measureTrack)
  const ratioFromPageXRef = useRef(ratioFromPageX)
  const applyRatioRef = useRef(applyRatio)
  measureTrackRef.current = measureTrack
  ratioFromPageXRef.current = ratioFromPageX
  applyRatioRef.current = applyRatio

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        measureTrackRef.current()
        if (!scrubbingRef.current) {
          scrubbingRef.current = true
          setScrubbing(true)
          onScrubStartRef.current?.()
        }
        const ratio = ratioFromPageXRef.current(evt.nativeEvent.pageX)
        applyRatioRef.current(ratio)
      },
      onPanResponderMove: (evt) => {
        applyRatioRef.current(ratioFromPageXRef.current(evt.nativeEvent.pageX))
      },
      onPanResponderRelease: (evt) => {
        applyRatioRef.current(ratioFromPageXRef.current(evt.nativeEvent.pageX))
        if (scrubbingRef.current) {
          scrubbingRef.current = false
          setScrubbing(false)
          setDragProgress(null)
          onScrubEndRef.current?.()
        }
      },
      onPanResponderTerminate: () => {
        if (scrubbingRef.current) {
          scrubbingRef.current = false
          setScrubbing(false)
          setDragProgress(null)
          onScrubEndRef.current?.()
        }
      },
    }),
  ).current

  const displayProgress = dragProgress ?? progress
  const clamped = Math.min(1, Math.max(0, displayProgress))
  const thumbSize = scrubbing ? THUMB_SIZE_ACTIVE : THUMB_SIZE
  const trackH = scrubbing ? TRACK_HEIGHT_ACTIVE : TRACK_HEIGHT

  return (
    <View
      ref={hitRef}
      style={[styles.hitArea, expanded && styles.hitAreaExpanded]}
      onLayout={measureTrack}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { height: trackH }]}>
        <View style={[styles.fill, { width: `${clamped * 100}%`, height: trackH }]} />
        <View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              marginLeft: -thumbSize / 2,
              left: `${clamped * 100}%`,
              top: (trackH - thumbSize) / 2,
            },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hitArea: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  hitAreaExpanded: {
    minHeight: 48,
    paddingVertical: 12,
  },
  track: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    position: 'relative',
    overflow: 'visible',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 3,
    backgroundColor: '#25D366',
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
})
