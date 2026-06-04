import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

export const ATTACH_TRAY_HEIGHT = 200

export const ATTACH_ANIM_MS = 260

const OPEN_MS = ATTACH_ANIM_MS
const OPEN_EASE = Easing.bezier(0.33, 0.01, 0, 1)

type AttachAction = {
  key: string
  label: string
  icon: string
  onPress: () => void
}

function AttachIconButton({
  label,
  icon,
  onPress,
}: {
  label: string
  icon: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
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
    { key: 'document', label: 'Document', icon: '📄', onPress: onDocument },
    { key: 'camera', label: 'Camera', icon: '📷', onPress: onCamera },
    { key: 'gallery', label: 'Gallery', icon: '🖼', onPress: onGallery },
    { key: 'location', label: 'Location', icon: '📍', onPress: onLocation },
  ]

  return (
    <Animated.View
      style={[styles.shell, shellStyle]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <View style={styles.panel}>
        <View style={styles.grid}>
          {actions.map((action) => (
            <AttachIconButton
              key={action.key}
              label={action.label}
              icon={action.icon}
              onPress={action.onPress}
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
  itemPressed: {
    opacity: 0.72,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  iconText: {
    fontSize: 26,
    textAlign: 'center',
    lineHeight: 30,
  },
  label: {
    fontSize: 12,
    color: '#3b4a54',
    textAlign: 'center',
    width: '100%',
  },
})
