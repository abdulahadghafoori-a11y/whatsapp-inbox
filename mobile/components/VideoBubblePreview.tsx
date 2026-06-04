import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { MessageSendingOverlay } from '@/components/MessageSendingOverlay'
import { resolveUploadUri } from '@/lib/uploadUri'

type VideoBubblePreviewProps = {
  uri: string
  width: number
  height: number
  uploading?: boolean
  /** When set, skips regenerating a thumbnail (from useVideoDimensions). */
  thumbUri?: string
}

/** Static thumbnail + play overlay for chat bubbles (fullscreen uses InteractiveVideoPlayer). */
export function VideoBubblePreview({
  uri,
  width,
  height,
  uploading = false,
  thumbUri: thumbUriProp,
}: VideoBubblePreviewProps) {
  const [thumbUri, setThumbUri] = useState<string | null>(thumbUriProp ?? null)
  const [loading, setLoading] = useState(!thumbUriProp)

  useEffect(() => {
    if (thumbUriProp) {
      setThumbUri(thumbUriProp)
      setLoading(false)
      return
    }

    let cancelled = false
    const source = resolveUploadUri(uri)

    setThumbUri(null)
    setLoading(true)

    void (async () => {
      try {
        const { uri: generated } = await VideoThumbnails.getThumbnailAsync(source, {
          time: 500,
          quality: 0.65,
        })
        if (!cancelled) setThumbUri(generated)
      } catch {
        if (!cancelled) setThumbUri(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [uri, thumbUriProp])

  return (
    <View style={[styles.wrap, { width, height }, uploading && styles.uploading]}>
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={{ width, height }}
          contentFit="cover"
          transition={120}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : (
        <View style={styles.fallback} />
      )}

      <View pointerEvents="none" style={styles.playLayer}>
        <View style={styles.playBtn}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>

      {uploading ? <MessageSendingOverlay label="Uploading…" /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  uploading: {
    opacity: 0.72,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2a2a2a',
  },
  playLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  playIcon: {
    color: '#fff',
    fontSize: 22,
    marginLeft: 4,
  },
})
