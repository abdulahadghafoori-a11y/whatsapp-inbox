import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

export function ScrollToLatestButton({
  visible,
  onPress,
  bottomInset = 12,
  unreadCount = 0,
}: {
  visible: boolean
  onPress: () => void
  bottomInset?: number
  unreadCount?: number
}) {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  if (!visible) return null

  const showBadge = unreadCount > 0

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
        accessibilityLabel={
          showBadge
            ? `Scroll to latest messages, ${unreadCount} unread`
            : 'Scroll to latest messages'
        }
        hitSlop={8}
      >
        {showBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
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
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
})
