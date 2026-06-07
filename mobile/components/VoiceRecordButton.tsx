import { Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { hapticMedium } from '@/lib/haptics'

type VoiceRecordButtonProps = {
  disabled?: boolean
  onPress: () => void
}

/** Tap to open the voice recorder bar (WhatsApp-style outline mic). */
export function VoiceRecordButton({ disabled, onPress }: VoiceRecordButtonProps) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return
        hapticMedium()
        onPress()
      }}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [styles.hit, (disabled || pressed) && styles.dimmed]}
      accessibilityRole="button"
      accessibilityLabel="Record voice message"
    >
      <Ionicons name="mic-outline" size={26} color="#aebac1" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.55,
  },
})
