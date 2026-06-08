import { useEffect, useRef } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { hapticMedium, hapticLight } from '@/lib/haptics'

type VoiceRecordButtonProps = {
  disabled?: boolean
  /** True while a recording is in progress (controlled by the parent). */
  recording?: boolean
  /** Begin recording (fired on press-in). */
  onStart: () => void
  /** Finger lifted after a real hold → send. */
  onSend: () => void
  /** Slid left past the cancel threshold, then released → discard. */
  onCancel: () => void
  /** A quick tap or a slide-up → keep recording hands-free (bar send button). */
  onLock: () => void
}

// Drag thresholds (px) for the WhatsApp-style hold gesture.
const CANCEL_DX = -90
const LOCK_DY = -70
// Below this hold duration we treat the press as a tap → lock (legacy behavior).
const TAP_MS = 250

/**
 * Hold to record, release to send. Slide left to cancel, slide up to lock.
 * A quick tap locks recording so the user can send via the bar (safe fallback
 * for the old tap-to-record flow).
 *
 * The PanResponder is created exactly once and reads callbacks/flags from refs,
 * so the parent's frequent re-renders (the recording timer ticks ~10×/s) never
 * recreate it and interrupt an in-flight gesture.
 */
export function VoiceRecordButton({
  disabled,
  recording,
  onStart,
  onSend,
  onCancel,
  onLock,
}: VoiceRecordButtonProps) {
  const cb = useRef({ disabled, onStart, onSend, onCancel, onLock })
  cb.current = { disabled, onStart, onSend, onCancel, onLock }

  const startedAt = useRef(0)
  const locked = useRef(false)
  const cancelling = useRef(false)
  const scale = useRef(new Animated.Value(1)).current

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !cb.current.disabled,
      onMoveShouldSetPanResponder: () => !cb.current.disabled,
      onPanResponderGrant: () => {
        startedAt.current = Date.now()
        locked.current = false
        cancelling.current = false
        hapticMedium()
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true }).start()
        cb.current.onStart()
      },
      onPanResponderMove: (_evt, gesture) => {
        if (locked.current) return
        if (gesture.dy < LOCK_DY) {
          locked.current = true
          hapticLight()
          cb.current.onLock()
          return
        }
        cancelling.current = gesture.dx < CANCEL_DX
      },
      onPanResponderRelease: () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        if (locked.current) return
        const heldMs = Date.now() - startedAt.current
        if (cancelling.current) cb.current.onCancel()
        else if (heldMs < TAP_MS) cb.current.onLock()
        else cb.current.onSend()
      },
      onPanResponderTerminate: () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        // Locked recordings continue (sent via the bar); an interrupted hold cancels.
        if (!locked.current) cb.current.onCancel()
      },
    }),
  ).current

  // Reset the visual scale if recording ends from outside (e.g. send button).
  useEffect(() => {
    if (!recording) Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
  }, [recording, scale])

  return (
    <View
      {...responder.panHandlers}
      hitSlop={10}
      style={[styles.hit, disabled && styles.dimmed]}
      accessibilityRole="button"
      accessibilityLabel="Hold to record voice message"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={recording ? 'mic' : 'mic-outline'}
          size={26}
          color={recording ? '#00A884' : '#aebac1'}
        />
      </Animated.View>
    </View>
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
