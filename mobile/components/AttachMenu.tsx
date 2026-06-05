import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { PressableScale } from '@/components/PressableScale'

export const ATTACH_TRAY_HEIGHT = 200

export const ATTACH_ANIM_MS = 260

const OPEN_MS = ATTACH_ANIM_MS
const OPEN_EASE = Easing.bezier(0.33, 0.01, 0, 1)

type AttachAction = {
  key: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
  onPress: () => void
}

function AttachIconButton({
  label,
  icon,
  color,
  onPress,
  isDark,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
  onPress: () => void
  isDark: boolean
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      scaleTo={0.9}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconCircle, { backgroundColor: color }]}>
        <Ionicons name={icon} size={26} color="#ffffff" />
      </View>
      <Text style={[styles.label, isDark && { color: '#aebac1' }]}>{label}</Text>
    </PressableScale>
  )
}

/** Attachment tray docked below the composer; animates up from the bottom. */
export function AttachPanel({
  open,
  targetHeight,
  onCloseComplete,
  onCamera,
  onGallery,
  onDocument,
  onLocation,
}: {
  open: boolean
  targetHeight: number
  onCloseComplete?: () => void
  onCamera: () => void
  onGallery: () => void
  onDocument: () => void
  onLocation: () => void
}) {
  const height = useSharedValue(0)
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    height.value = withTiming(
      open ? targetHeight : 0,
      { duration: OPEN_MS, easing: OPEN_EASE },
      (finished) => {
        if (finished && !open && onCloseComplete) {
          runOnJS(onCloseComplete)()
        }
      },
    )
  }, [open, targetHeight, height, onCloseComplete])

  const shellStyle = useAnimatedStyle(() => ({
    height: height.value,
  }))

  const actions: AttachAction[] = [
    { key: 'document', label: 'Document', icon: 'document-text', color: '#5E6BD8', onPress: onDocument },
    { key: 'camera', label: 'Camera', icon: 'camera', color: '#E8497E', onPress: onCamera },
    { key: 'gallery', label: 'Gallery', icon: 'images', color: '#B044D6', onPress: onGallery },
    { key: 'location', label: 'Location', icon: 'location', color: '#1FA855', onPress: onLocation },
  ]

  return (
    <Animated.View
      style={[styles.shell, isDark && { backgroundColor: '#1f2c33' }, shellStyle]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <View style={styles.panel}>
        <View style={styles.grid}>
          {actions.map((action) => (
            <AttachIconButton
              key={action.key}
              label={action.label}
              icon={action.icon}
              color={action.color}
              onPress={action.onPress}
              isDark={isDark}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    backgroundColor: '#f0f2f5',
  },
  panel: {
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    rowGap: 12,
  },
  item: {
    width: '22%',
    minWidth: 72,
    maxWidth: 88,
    alignItems: 'center',
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#3b4a54',
    textAlign: 'center',
    width: '100%',
  },
})
