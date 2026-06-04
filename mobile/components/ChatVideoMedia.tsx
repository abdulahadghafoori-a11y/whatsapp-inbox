import { useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useVideoDimensions } from '@/hooks/useVideoDimensions'
import { VideoBubblePreview } from '@/components/VideoBubblePreview'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'

type ChatVideoMediaProps = {
  uri: string
  messageId: string
  uploading?: boolean
  onPress?: () => void
}

export function ChatVideoMedia({
  uri,
  messageId,
  uploading = false,
  onPress,
}: ChatVideoMediaProps) {
  const videoMeta = useVideoDimensions(uri, messageId)
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
      disabled={!onPress}
      style={[styles.wrap, { width: layout.width, height: layout.height }]}
    >
      <VideoBubblePreview
        uri={uri}
        width={layout.width}
        height={layout.height}
        uploading={uploading}
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
