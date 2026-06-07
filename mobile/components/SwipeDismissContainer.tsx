import type { ReactNode } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 900

export function SwipeDismissContainer({
  children,
  onDismiss,
  enabled = true,
  style,
}: {
  children: ReactNode
  onDismiss: () => void
  enabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const translateY = useSharedValue(0)

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY(12)
    .failOffsetX([-28, 28])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(onDismiss)()
        translateY.value = 0
        return
      }
      translateY.value = withSpring(0, { damping: 22, stiffness: 280 })
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: Math.max(0.35, 1 - translateY.value / 420),
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style, animStyle]}>{children}</Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
})
