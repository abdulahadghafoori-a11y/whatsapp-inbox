import { View, Text, StyleSheet } from 'react-native'
import { useColorScheme } from 'nativewind'

export function ChatDatePill({ label }: { label: string }) {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, isDark ? styles.pillDark : styles.pillLight]}>
        <Text style={[styles.text, isDark ? styles.textDark : styles.textLight]}>{label}</Text>
      </View>
    </View>
  )
}

export function ChatStickyDateBar({ label, visible }: { label: string; visible: boolean }) {
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'

  if (!visible || !label) return null

  return (
    <View style={styles.stickyWrap} pointerEvents="none">
      <View style={[styles.stickyPill, isDark ? styles.stickyPillDark : styles.stickyPillLight]}>
        <Text style={[styles.text, isDark ? styles.textDark : styles.textLight]}>{label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  pillDark: {
    backgroundColor: 'rgba(31, 44, 52, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  textLight: {
    color: '#54656f',
  },
  textDark: {
    color: '#aebac1',
  },
  stickyWrap: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  stickyPill: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stickyPillLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(0, 128, 105, 0.12)',
    shadowColor: '#008069',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  stickyPillDark: {
    backgroundColor: 'rgba(31, 44, 52, 0.98)',
    borderColor: 'rgba(0, 168, 132, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
})
