import { useMemo, useState } from 'react'
import { Pressable, View, ActivityIndicator, StyleSheet } from 'react-native'
import { MessageSendingOverlay } from '@/components/MessageSendingOverlay'
import { Image } from 'expo-image'
import type { PixelSize } from '@/hooks/useImageDimensions'
import {
  BUBBLE_MEDIA_MAX_WIDTH,
  bubbleSizeFromPixelSize,
} from '@/lib/chatMediaLayout'
import { MESSAGE_LONG_PRESS_MS } from '@/lib/chatLongPress'

type ChatImageMediaProps = {
  uri: string
  /** Stable expo-image recycling key (message id) — avoids reload when local uri changes. */
  cacheKey?: string
  sticker?: boolean
  uploading?: boolean
  uploadLabel?: string
  /** Base64 ThumbHash — paints an instant blurred placeholder before decode. */
  thumbhash?: string | null
  /** Intrinsic media dimensions — reserve the correct aspect ratio up front. */
  intrinsicWidth?: number | null
  intrinsicHeight?: number | null
  onPress?: () => void
  onLongPress?: () => void
}

export function ChatImageMedia({
  uri,
  cacheKey,
  sticker = false,
  uploading = false,
  uploadLabel,
  thumbhash,
  intrinsicWidth,
  intrinsicHeight,
  onPress,
  onLongPress,
}: ChatImageMediaProps) {
  const [pixelSize, setPixelSize] = useState<PixelSize | null>(null)

  const layout = useMemo(() => {
    // Prefer measured pixels, then server-provided intrinsic dims (no layout jump).
    const w = pixelSize?.width ?? intrinsicWidth ?? null
    const h = pixelSize?.height ?? intrinsicHeight ?? null
    if (w && h) {
      return bubbleSizeFromPixelSize(w, h, { sticker })
    }
    return {
      width: sticker ? 160 : BUBBLE_MEDIA_MAX_WIDTH,
      height: sticker ? 160 : Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.75),
    }
  }, [pixelSize, sticker, intrinsicWidth, intrinsicHeight])

  const placeholder = thumbhash ? { thumbhash } : undefined

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={MESSAGE_LONG_PRESS_MS}
      disabled={!onPress && !onLongPress}
      style={[styles.wrap, { width: layout.width, height: layout.height }]}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          {
            width: layout.width,
            height: layout.height,
            opacity: 1,
          },
        ]}
        contentFit="cover"
        placeholder={placeholder}
        placeholderContentFit="cover"
        transition={cacheKey ? 0 : 150}
        recyclingKey={cacheKey ?? uri}
        onLoad={(e) => {
          const { width, height } = e.source
          if (width > 0 && height > 0) {
            setPixelSize((prev) =>
              prev?.width === width && prev?.height === height ? prev : { width, height },
            )
          }
        }}
      />
      {/* Spinner only when we have neither a ThumbHash placeholder nor a decoded size. */}
      {!pixelSize && !placeholder ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#00A884" size="small" />
        </View>
      ) : null}
      {uploading ? <MessageSendingOverlay label={uploadLabel ?? 'Uploading…'} /> : null}
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
