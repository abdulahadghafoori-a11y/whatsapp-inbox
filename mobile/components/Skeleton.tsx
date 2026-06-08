import { memo, useEffect, useRef } from 'react'
import { Animated, View, type ViewStyle } from 'react-native'
import { useColorScheme } from 'nativewind'

type SkeletonBlockProps = {
  width: number | `${number}%`
  height: number
  radius?: number
  style?: ViewStyle
}

/** A single pulsing placeholder block. Uses the RN Animated loop (no worklets). */
export const SkeletonBlock = memo(function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: SkeletonBlockProps) {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const opacity = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: isDark ? '#2A3942' : '#E4E7EB',
          opacity,
        },
        style,
      ]}
    />
  )
})

/** Inbox loading state: a column of conversation-row placeholders. */
export const InboxSkeleton = memo(function InboxSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <View className="bg-white dark:bg-wa-panelDeep">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-4 py-3" style={{ height: 76 }}>
          <SkeletonBlock width={52} height={52} radius={26} />
          <View className="flex-1 gap-2">
            <View className="flex-row items-center justify-between">
              <SkeletonBlock width="45%" height={15} />
              <SkeletonBlock width={36} height={11} />
            </View>
            <SkeletonBlock width="72%" height={13} />
          </View>
        </View>
      ))}
    </View>
  )
})
