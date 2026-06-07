import { useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const DISMISS_THRESHOLD = 100
const MAX_SCALE = 5

type ZoomableImageViewerProps = {
  uri: string
  /** When set, dragging down at 1x scale closes the viewer (WhatsApp-style). */
  onRequestClose?: () => void
  enableDismissGesture?: boolean
  backgroundColor?: string
  /** Fill parent (preview sheet) instead of full-screen dimensions. */
  fillContainer?: boolean
}

export function ZoomableImageViewer({
  uri,
  onRequestClose,
  enableDismissGesture = false,
  backgroundColor = '#000',
  fillContainer = false,
}: ZoomableImageViewerProps) {
  const [layout, setLayout] = useState({
    w: fillContainer ? SCREEN_W : SCREEN_W,
    h: fillContainer ? SCREEN_H * 0.55 : SCREEN_H * 0.85,
  })

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const dismissY = useSharedValue(0)

  function close() {
    onRequestClose?.()
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.5, savedScale.value * e.scale))
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1)
        savedScale.value = 1
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        return
      }
      if (scale.value > MAX_SCALE) {
        scale.value = withSpring(MAX_SCALE)
      }
      savedScale.value = scale.value
    })

  const panZoom = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.02) {
        translateX.value = e.translationX
        translateY.value = e.translationY
      }
    })
    .onEnd(() => {
      if (scale.value > 1.02) {
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
      }
    })

  const panDismiss = Gesture.Pan()
    .enabled(enableDismissGesture && !!onRequestClose)
    .activeOffsetY(16)
    .failOffsetX([-22, 22])
    .onUpdate((e) => {
      if (scale.value <= 1.02 && e.translationY > 0) {
        dismissY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.02) return
      if (
        dismissY.value > DISMISS_THRESHOLD ||
        e.velocityY > 900
      ) {
        runOnJS(close)()
        dismissY.value = 0
        return
      }
      dismissY.value = withSpring(0)
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withSpring(1)
        savedScale.value = 1
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        dismissY.value = withSpring(0)
      } else {
        scale.value = withSpring(2.5)
        savedScale.value = 2.5
      }
    })

  const gesture = Gesture.Simultaneous(pinch, panZoom, panDismiss, doubleTap)

  const imageAnim = useAnimatedStyle(() => {
    const ty = scale.value > 1.02 ? translateY.value : dismissY.value
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: ty },
        { scale: scale.value },
      ],
    }
  })

  const backdropAnim = useAnimatedStyle(() => {
    if (!enableDismissGesture || scale.value > 1.02) {
      return { opacity: 1 }
    }
    const progress = Math.min(1, Math.abs(dismissY.value) / 280)
    return { opacity: 1 - progress * 0.55 }
  })

  const imageStyle = fillContainer
    ? { width: layout.w, height: layout.h }
    : styles.image

  return (
    <View
      style={[
        fillContainer ? styles.rootFill : styles.root,
        { backgroundColor },
      ]}
      onLayout={
        fillContainer
          ? (e) => {
              const { width, height } = e.nativeEvent.layout
              if (width > 8 && height > 8) {
                setLayout({ w: width, h: height })
              }
            }
          : undefined
      }
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropAnim, { backgroundColor }]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.center}>
          <Animated.View style={imageAnim}>
            <Image source={{ uri }} style={imageStyle} contentFit="contain" />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: SCREEN_W,
    minHeight: SCREEN_H * 0.4,
  },
  rootFill: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.85,
  },
})
