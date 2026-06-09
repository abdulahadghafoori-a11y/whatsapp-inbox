import { useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useVideoDimensions } from '@/hooks/useVideoDimensions'
import { VideoBubblePreview } from '@/components/VideoBubblePreview'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'
import { MESSAGE_LONG_PRESS_MS } from '@/lib/chatLongPress'

type ChatVideoMediaProps = {
  uri: string
  messageId: string
  active?: boolean
  sizeBytes?: number | null
  uploading?: boolean
  uploadLabel?: string
  onPress?: () => void
  onLongPress?: () => void
}

export function ChatVideoMedia({
  uri,
  messageId,
  active = true,
  sizeBytes,
  uploading = false,
  uploadLabel,
  onPress,
  onLongPress,
}: ChatVideoMediaProps) {
  const videoMeta = useVideoDimensions(uri, messageId, active)
  const layout = useMemo(() => {
    if (videoMeta && videoMeta.width > 0 && videoMeta.height > 0) {
      return bubbleSizeFromPixelSize(videoMeta.width, videoMeta.height)
    }
    return {
      width: BUBBLE_MEDIA_MAX_WIDTH,
      height: Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.56),
    }
  }, [videoMeta])

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={MESSAGE_LONG_PRESS_MS}
      disabled={!onPress && !onLongPress}
      style={[styles.wrap, { width: layout.width, height: layout.height }]}
    >
      <VideoBubblePreview
        uri={uri}
        width={layout.width}
        height={layout.height}
        active={active}
        sizeBytes={sizeBytes}
        uploading={uploading}
        uploadLabel={uploadLabel}
        thumbUri={videoMeta?.thumbUri}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
})
