import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'
import type { MessageType } from '@/types'

const ICON: Partial<Record<MessageType, keyof typeof Ionicons.glyphMap>> = {
  image: 'image-outline',
  sticker: 'happy-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
  document: 'document-outline',
}

type MediaShellPlaceholderProps = {
  type: MessageType
  sticker?: boolean
}

/** Off-screen placeholder — fixed layout, zero network/decode work. */
export function MediaShellPlaceholder({ type, sticker }: MediaShellPlaceholderProps) {
  const layout =
    type === 'audio'
      ? { width: 296, height: 48 }
      : bubbleSizeFromPixelSize(sticker ? 1 : 4, sticker ? 1 : 3, { sticker })

  const icon = ICON[type] ?? 'attach-outline'

  return (
    <View style={[styles.wrap, { width: layout.width, height: layout.height }]}>
      <View style={styles.inner}>
        <Ionicons name={icon} size={type === 'audio' ? 20 : 28} color="rgba(134,150,160,0.75)" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    backgroundColor: 'rgba(11,20,26,0.04)',
    overflow: 'hidden',
    maxWidth: BUBBLE_MEDIA_MAX_WIDTH,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
