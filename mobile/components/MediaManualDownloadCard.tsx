import { Pressable, View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'
import { formatMediaSize } from '@/lib/formatMediaSize'
import type { MessageType } from '@/types'

const ICON: Partial<Record<MessageType, keyof typeof Ionicons.glyphMap>> = {
  image: 'image-outline',
  sticker: 'happy-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
  document: 'document-outline',
}

type MediaManualDownloadCardProps = {
  type: MessageType
  label: string
  sizeBytes?: number | null
  hint?: string | null
  sticker?: boolean
  downloading?: boolean
  onDownload: () => void
}

/** WhatsApp-style “tap to download” when auto-download is blocked. */
export function MediaManualDownloadCard({
  type,
  label,
  sizeBytes,
  hint,
  sticker,
  downloading,
  onDownload,
}: MediaManualDownloadCardProps) {
  const layout =
    type === 'audio'
      ? { width: 296, height: 52 }
      : bubbleSizeFromPixelSize(sticker ? 1 : 4, sticker ? 1 : 3, { sticker })

  const sizeLabel = formatMediaSize(sizeBytes ?? null)
  const icon = ICON[type] ?? 'cloud-download-outline'

  return (
    <Pressable
      onPress={onDownload}
      disabled={downloading}
      style={[styles.wrap, { width: layout.width, minHeight: layout.height }]}
    >
      <View style={styles.iconCircle}>
        {downloading ? (
          <ActivityIndicator color="#00A884" size="small" />
        ) : (
          <Ionicons name={icon} size={type === 'audio' ? 20 : 28} color="#8696a0" />
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
      {sizeLabel ? <Text style={styles.size}>{sizeLabel}</Text> : null}
      <Text style={styles.hint}>{downloading ? 'Downloading…' : (hint ?? 'Tap to download')}</Text>
      {!downloading ? (
        <View style={styles.downloadBadge}>
          <Ionicons name="arrow-down-circle" size={22} color="#00A884" />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxWidth: BUBBLE_MEDIA_MAX_WIDTH,
  },
  iconCircle: {
    marginBottom: 6,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b4a54',
  },
  size: {
    marginTop: 2,
    fontSize: 12,
    color: '#8696a0',
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: '#667781',
    textAlign: 'center',
  },
  downloadBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    opacity: 0.9,
  },
})
