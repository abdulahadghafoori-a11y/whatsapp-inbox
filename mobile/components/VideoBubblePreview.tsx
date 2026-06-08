import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, InteractionManager } from 'react-native'
import { Image } from 'expo-image'
import { MessageSendingOverlay } from '@/components/MessageSendingOverlay'
import { formatMediaSize } from '@/lib/formatMediaSize'
import { getVideoThumbnail, getVideoThumbnailSync } from '@/lib/videoThumbnailCache'

type VideoBubblePreviewProps = {
  uri: string
  width: number
  height: number
  uploading?: boolean
  uploadLabel?: string
  sizeBytes?: number | null
  /** When set, skips regenerating a thumbnail (from useVideoDimensions). */
  thumbUri?: string
  /** Off-screen rows skip remote video decode entirely. */
  active?: boolean
}

function isLocalUri(uri: string) {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    (uri.startsWith('/') && !uri.startsWith('//'))
  )
}

/** Static thumbnail + play overlay for chat bubbles (fullscreen uses InteractiveVideoPlayer). */
export function VideoBubblePreview({
  uri,
  width,
  height,
  uploading = false,
  uploadLabel,
  thumbUri: thumbUriProp,
  sizeBytes,
  active = true,
}: VideoBubblePreviewProps) {
  const sizeLabel = formatMediaSize(sizeBytes ?? null)
  // Seed from the prop or the shared cache so re-entering the viewport never
  // re-decodes a thumbnail we already generated this session.
  const initialThumb = thumbUriProp ?? (isLocalUri(uri) ? getVideoThumbnailSync(uri) : null)
  const [thumbUri, setThumbUri] = useState<string | null>(initialThumb)
  const [loading, setLoading] = useState(
    active && !initialThumb && isLocalUri(uri),
  )

  useEffect(() => {
    if (thumbUriProp) {
      setThumbUri(thumbUriProp)
      setLoading(false)
      return
    }

    if (!isLocalUri(uri)) {
      setThumbUri(null)
      setLoading(false)
      return
    }

    const cached = getVideoThumbnailSync(uri)
    if (cached) {
      setThumbUri(cached)
      setLoading(false)
      return
    }

    if (!active) {
      setThumbUri(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setThumbUri(null)
    setLoading(true)

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const generated = await getVideoThumbnail(uri)
        if (cancelled) return
        setThumbUri(generated)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
      task.cancel()
    }
  }, [uri, thumbUriProp, active])

  return (
    <View style={[styles.wrap, { width, height }, uploading && styles.uploading]}>
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={{ width, height }}
          contentFit="cover"
          transition={120}
          recyclingKey={thumbUri}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : (
        <View style={styles.fallback} />
      )}
      <View style={styles.playBadge}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
      {sizeLabel ? (
        <View style={styles.sizeBadge}>
          <Text style={styles.sizeText}>{sizeLabel}</Text>
        </View>
      ) : null}
      {uploading ? <MessageSendingOverlay label={uploadLabel ?? 'Uploading…'} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#0b141a',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#1f2c34',
  },
  playBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 18,
    marginLeft: 3,
  },
  sizeBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
})
