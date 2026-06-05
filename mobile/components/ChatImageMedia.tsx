import { useMemo } from 'react'
import { Pressable, View, ActivityIndicator, StyleSheet } from 'react-native'
import { MessageSendingOverlay } from '@/components/MessageSendingOverlay'
import { Image } from 'expo-image'
import { useImageDimensions } from '@/hooks/useImageDimensions'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'

type ChatImageMediaProps = {
  uri: string
  sticker?: boolean
  uploading?: boolean
  onPress?: () => void
}

export function ChatImageMedia({
  uri,
  sticker = false,
  uploading = false,
  onPress,
}: ChatImageMediaProps) {
  const pixelSize = useImageDimensions(uri)
  const layout = useMemo(() => {
    if (pixelSize) {
      return bubbleSizeFromPixelSize(pixelSize.width, pixelSize.height, { sticker })
    }
    return {
      width: sticker ? 160 : BUBBLE_MEDIA_MAX_WIDTH,
      height: sticker ? 160 : Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.75),
    }
  }, [pixelSize, sticker])

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.wrap, { width: layout.width, height: layout.height }]}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          {
            width: layout.width,
            height: layout.height,
            opacity: uploading ? 0.72 : 1,
          },
        ]}
        contentFit="cover"
        transition={150}
      />
      {!pixelSize ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#00A884" size="small" />
        </View>
      ) : null}
      {uploading ? <MessageSendingOverlay label="Uploading…" /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  image: {
    borderRadius: 12,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
