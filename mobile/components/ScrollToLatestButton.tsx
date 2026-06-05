import { Pressable, StyleSheet, Text } from 'react-native'
import { useColorScheme } from 'nativewind'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

export function ScrollToLatestButton({
  visible,
  onPress,
  bottomInset = 12,
}: {
  visible: boolean
  onPress: () => void
  bottomInset?: number
}) {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  if (!visible) return null

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      style={[styles.wrap, { bottom: bottomInset }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        style={[styles.btn, isDark && { backgroundColor: '#2a3942' }]}
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest messages"
        hitSlop={8}
      >
        <Text style={[styles.icon, isDark && { color: '#aebac1' }]}>⌄</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    zIndex: 30,
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  icon: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '600',
    color: '#54656f',
    marginTop: -2,
  },
})
