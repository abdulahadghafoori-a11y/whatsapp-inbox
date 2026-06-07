import { useCallback } from 'react'
import { Pressable, View, type PressableProps, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
} from '@/lib/haptics'

type HapticKind = 'light' | 'medium' | 'selection' | 'none'

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** How far to scale down while pressed. Default 0.94. */
  scaleTo?: number
  /** Tactile feedback fired on press-in. Default 'light'. */
  haptic?: HapticKind
  /** Dim opacity while pressed for an extra premium touch. Default true. */
  dim?: boolean
  className?: string
  style?: ViewStyle | ViewStyle[]
  children?: React.ReactNode
}

const SPRING = { damping: 16, stiffness: 320, mass: 0.6 }

function fireHaptic(kind: HapticKind) {
  if (kind === 'light') hapticLight()
  else if (kind === 'medium') hapticMedium()
  else if (kind === 'selection') hapticSelection()
}

/**
 * Premium tap target: springs down on press with optional haptic + dim.
 * Drop-in replacement for Pressable across the app to give every control a
 * consistent, tactile, "native-feeling" response.
 */
export function PressableScale({
  scaleTo = 0.94,
  haptic = 'light',
  dim = true,
  onPressIn,
  onPressOut,
  disabled,
  className,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      if (disabled) return
      scale.value = withSpring(scaleTo, SPRING)
      if (dim) opacity.value = withTiming(0.85, { duration: 90 })
      fireHaptic(haptic)
      onPressIn?.(e)
    },
    [disabled, scale, scaleTo, dim, opacity, haptic, onPressIn],
  )

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      scale.value = withSpring(1, SPRING)
      if (dim) opacity.value = withTiming(1, { duration: 120 })
      onPressOut?.(e)
    },
    [scale, dim, opacity, onPressOut],
  )

  // className on Pressable trips NativeWind css-interop → navigation context crash.
  return (
    <View className={className} style={style}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          {...rest}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  )
}
