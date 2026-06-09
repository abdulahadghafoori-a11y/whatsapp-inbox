import { memo, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { openDocumentFromUrl } from '@/lib/openDocument'
import { BUBBLE_MEDIA_MAX_WIDTH } from '@/lib/chatMediaLayout'
import { useMessageMedia } from '@/hooks/useMessageMedia'
import { useMessageMediaActive } from '@/hooks/useMessageMediaActive'
import { useResolvedCachedMediaUri } from '@/hooks/useCachedMediaUri'
import { useMediaAutoDownload } from '@/hooks/useMediaAutoDownload'
import { useMediaDownloadState } from '@/hooks/useMediaDownloadState'
import { MediaShellPlaceholder } from '@/components/MediaShellPlaceholder'
import { MediaManualDownloadCard } from '@/components/MediaManualDownloadCard'
import { syncMessageMedia } from '@/lib/messageMediaSync'
import { queueMediaPresign } from '@/lib/mediaPresignBatch'
import { resolvePlaybackUri } from '@/lib/mediaPlayback'
import { MEDIA_LABEL } from '@/lib/mediaAutoDownload'
import { formatMediaSize } from '@/lib/formatMediaSize'
import { messageFileSizeBytes } from '@/lib/messageFileSize'
import { AudioPlayer } from './AudioPlayer'
import { ChatVideoMedia } from './ChatVideoMedia'
import { ChatImageMedia } from './ChatImageMedia'
import { MediaFullscreenViewer } from './MediaFullscreenViewer'
import { VideoFullscreenViewer } from './VideoFullscreenViewer'
import { mediaSendOverlayLabel } from '@/lib/mediaSendPhase'
import { MESSAGE_LONG_PRESS_MS } from '@/lib/chatLongPress'
import { getCachedMediaUriSync } from '@/lib/messageMediaCache'
import { mediaDisplayCache } from '@/lib/mediaDisplayCache'
import { isStickerType } from '@/lib/messageMediaKind'
import { hasMessageMediaBeenActivated } from '@/lib/visibleMessageMedia'
import { resolveUploadUri } from '@/lib/uploadUri'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import { computeThumbhashFromUri } from '@/lib/thumbhashGen'
import { sha256FromStorageKey, uploadThumbhash } from '@/lib/thumbhashUpload'
import type { Message } from '@/types'

const FALLBACK_MEDIA_HEIGHT = Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.75)

function MediaPlaceholder({
  children,
  minHeight = 120,
  minWidth = 200,
}: {
  children: ReactNode
  minHeight?: number
  minWidth?: number
}) {
  return (
    <View
      style={{ minHeight, minWidth }}
      className="w-full items-center justify-center rounded-xl bg-black/[0.04] px-4 py-5"
    >
      {children}
    </View>
  )
}

function fileExtension(filename: string | null, mimeType: string | null): string {
  if (filename?.includes('.')) {
    return filename.split('.').pop()!.toLowerCase()
  }
  if (mimeType?.includes('/')) {
    return mimeType.split('/').pop()!.toLowerCase()
  }
  return 'file'
}

function DocumentBubble({
  message,
  openingDoc,
  onOpen,
  onLongPress,
  outbound,
  sizeBytes,
}: {
  message: Message
  openingDoc: boolean
  onOpen: () => void
  onLongPress?: () => void
  outbound: boolean
  sizeBytes?: number | null
}) {
  const ext = fileExtension(message.mediaFilename, message.mediaMimeType)
  const isPdf = ext === 'pdf'
  const iconColor = isPdf ? '#e53935' : '#00A884'
  const sizeLabel = formatMediaSize(sizeBytes ?? null)

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={MESSAGE_LONG_PRESS_MS}
      disabled={openingDoc}
      style={styles.docRow}
    >
      <View style={[styles.docIconWrap, { backgroundColor: `${iconColor}18` }]}>
        {openingDoc ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : isPdf ? (
          <Text style={[styles.docExt, { color: iconColor }]}>PDF</Text>
        ) : (
          <Text style={[styles.docExt, { color: iconColor }]}>{ext.slice(0, 3).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.docBody}>
        <Text
          numberOfLines={2}
          style={[styles.docName, outbound ? styles.docNameOut : styles.docNameIn]}
        >
          {message.mediaFilename ?? 'Document'}
        </Text>
        <Text style={styles.docMeta}>
          {sizeLabel ? `${ext} · ${sizeLabel}` : ext}
        </Text>
      </View>
      <View style={styles.docDownload}>
        <Ionicons name="arrow-down-circle" size={28} color="#8696a0" />
      </View>
    </Pressable>
  )
}

function MediaMessageBase({
  message,
  variant = 'inbound',
  contactName,
  contactAvatarUrl,
  onReplyQuotePress,
  onLongPress,
}: {
  message: Message
  variant?: 'inbound' | 'outbound'
  contactName?: string
  contactAvatarUrl?: string | null
  onReplyQuotePress?: (messageId: string) => void
  onLongPress?: () => void
}) {
  const queryClient = useQueryClient()
  const agent = useAuthStore((s) => s.agent)
  const outbound = variant === 'outbound'
  const localPreview = message.localPreviewUri
  const pending = message.mediaStatus === 'pending'
  const mediaDownloadFailed = message.mediaStatus === 'failed' && !message.mediaUrl
  const sendOverlay = outbound ? mediaSendOverlayLabel(message) : null
  const uploading = !!sendOverlay
  const isSticker = isStickerType(message.type)
  const fileSize = messageFileSizeBytes(message)
  const mediaLabel = MEDIA_LABEL[message.type] ?? 'Media'

  const mediaActive = useMessageMediaActive(message.id)
  const sessionDisplay = mediaDisplayCache.get(message.id)
  const cachedUri = useResolvedCachedMediaUri(message.id, message.mediaUrl)
  const diskUri = cachedUri ?? getCachedMediaUriSync(message.id) ?? null
  const seededLocalUri = message.localPreviewUri
    ? resolveUploadUri(message.localPreviewUri)
    : null
  const cachedOnDisk = !!(diskUri || message.localPreviewUri)
  const hasLocalSource = !!(cachedOnDisk || message.localPreviewUri)
  const showMedia =
    cachedOnDisk ||
    !!message.localPreviewUri ||
    (outbound && !pending && !uploading) ||
    hasMessageMediaBeenActivated(message.id)
  const [manualDownload, setManualDownload] = useState(false)
  const { allowed: autoAllowed, blockReason } = useMediaAutoDownload({
    type: message.type,
    direction: message.direction,
  })
  const isDownloading = useMediaDownloadState(message.id)

  // Once a local image file exists and no ThumbHash is registered yet, generate
  // it off the render path and publish it so every device gets instant placeholders.
  const thumbhashSource =
    message.type === 'image' ? (cachedUri ?? message.localPreviewUri ?? null) : null
  useEffect(() => {
    if (message.type !== 'image' || message.thumbhash || !thumbhashSource) return
    if (!sha256FromStorageKey(message.mediaUrl)) return
    let cancelled = false
    void (async () => {
      const gen = await computeThumbhashFromUri(thumbhashSource)
      if (cancelled || !gen) return
      await uploadThumbhash({
        storageKey: message.mediaUrl,
        messageId: message.id,
        thumbhash: gen.thumbhash,
        width: gen.width,
        height: gen.height,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [message.type, message.thumbhash, message.mediaUrl, message.id, thumbhashSource])

  const shouldLoadRemote =
    showMedia &&
    (hasLocalSource || outbound || manualDownload || autoAllowed === true || isSticker)

  const { displayUrl: hookDisplayUrl, playbackUrl, remoteUrl, isLoading, isError } =
    useMessageMedia(message, {
      loadRemote: shouldLoadRemote,
    })

  const effectiveDisplayUrl =
    hookDisplayUrl ??
    sessionDisplay?.uri ??
    diskUri ??
    seededLocalUri ??
    null

  const effectivePlaybackUrl = playbackUrl ?? effectiveDisplayUrl

  useEffect(() => {
    if (!hookDisplayUrl) return
    if (message.type !== 'image' && message.type !== 'sticker' && message.type !== 'video') {
      return
    }
    mediaDisplayCache.set(message.id, {
      uri: hookDisplayUrl,
      width: message.mediaWidth ?? sessionDisplay?.width ?? 0,
      height: message.mediaHeight ?? sessionDisplay?.height ?? 0,
      type: message.type === 'video' ? 'video' : 'image',
      thumbnailUri: sessionDisplay?.thumbnailUri,
    })
  }, [
    hookDisplayUrl,
    message.id,
    message.type,
    message.mediaWidth,
    message.mediaHeight,
    sessionDisplay?.width,
    sessionDisplay?.height,
    sessionDisplay?.thumbnailUri,
  ])

  const persistImageDimensions = useCallback(
    (width: number, height: number) => {
      if (!effectiveDisplayUrl) return
      mediaDisplayCache.set(message.id, {
        uri: effectiveDisplayUrl,
        width,
        height,
        type: 'image',
      })
    },
    [effectiveDisplayUrl, message.id],
  )

  const resolveUri = useCallback(
    () => resolvePlaybackUri(message, remoteUrl),
    [message, remoteUrl],
  )

  const [imageFullScreen, setImageFullScreen] = useState(false)
  const [videoFullScreen, setVideoFullScreen] = useState(false)
  const [videoPlaybackUrl, setVideoPlaybackUrl] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [openingDoc, setOpeningDoc] = useState(false)

  const startManualDownload = useCallback(() => {
    if (!message.mediaUrl) return
    setManualDownload(true)
    queueMediaPresign(queryClient, message.mediaUrl, message.id, { force: true })
    void syncMessageMedia(message, { force: true })
  }, [message, queryClient])

  async function retryDownload() {
    if (retrying) return
    setRetrying(true)
    try {
      if (mediaDownloadFailed || message.mediaStatus === 'failed') {
        await api.post(`/messages/media/${message.id}/retry`)
      } else {
        startManualDownload()
      }
    } catch {
      /* parent refetch / socket will update when job completes */
    } finally {
      setRetrying(false)
    }
  }

  if (
    !showMedia &&
    !effectiveDisplayUrl &&
    !localPreview &&
    !diskUri &&
    message.mediaUrl &&
    message.mediaStatus !== 'pending' &&
    message.type !== 'text' &&
    message.type !== 'location'
  ) {
    return <MediaShellPlaceholder type={message.type} sticker={message.type === 'sticker'} />
  }

  if (
    mediaActive &&
    autoAllowed === null &&
    !effectiveDisplayUrl &&
    !localPreview &&
    !outbound &&
    message.mediaUrl
  ) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 48 : 100}>
        <ActivityIndicator color="#00A884" size="small" />
      </MediaPlaceholder>
    )
  }

  if (
    !isSticker &&
    !outbound &&
    autoAllowed === false &&
    !manualDownload &&
    !effectiveDisplayUrl &&
    !localPreview &&
    !diskUri &&
    message.mediaUrl
  ) {
    return (
      <MediaManualDownloadCard
        type={message.type}
        label={mediaLabel}
        sizeBytes={fileSize}
        hint={blockReason}
        sticker={message.type === 'sticker'}
        downloading={isDownloading}
        onDownload={startManualDownload}
      />
    )
  }

  if (pending && !localPreview && !effectiveDisplayUrl) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : 140}>
        <ActivityIndicator color="#00A884" />
        <Text className="mt-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {mediaLabel}
        </Text>
        <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Downloading…
        </Text>
      </MediaPlaceholder>
    )
  }

  if (mediaDownloadFailed && !localPreview && !effectiveDisplayUrl) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : 140}>
        <Text className="text-sm font-medium text-red-600">Media unavailable</Text>
        <Pressable
          onPress={() => void retryDownload()}
          disabled={retrying}
          className="mt-3 rounded-full bg-wa-teal px-4 py-2"
        >
          {retrying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-xs font-semibold text-white">Retry download</Text>
          )}
        </Pressable>
      </MediaPlaceholder>
    )
  }

  if (!effectiveDisplayUrl && !localPreview && !diskUri && (isLoading || isDownloading)) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : FALLBACK_MEDIA_HEIGHT}>
        <ActivityIndicator color="#00A884" />
        <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Downloading…</Text>
      </MediaPlaceholder>
    )
  }

  if (!effectiveDisplayUrl && isError) {
    return (
      <MediaPlaceholder minHeight={FALLBACK_MEDIA_HEIGHT}>
        <Text className="text-sm text-red-600">Could not load media</Text>
        <Pressable
          onPress={() => void retryDownload()}
          disabled={retrying}
          className="mt-3 rounded-full bg-wa-teal px-4 py-2"
        >
          {retrying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-xs font-semibold text-white">Retry download</Text>
          )}
        </Pressable>
      </MediaPlaceholder>
    )
  }

  if (message.type === 'image' || message.type === 'sticker') {
    if (!effectiveDisplayUrl) {
      if (showMedia || sessionDisplay || isLoading || isDownloading) {
        return (
          <MediaPlaceholder minHeight={FALLBACK_MEDIA_HEIGHT}>
            <ActivityIndicator color="#00A884" size="small" />
          </MediaPlaceholder>
        )
      }
      return (
        <MediaPlaceholder minHeight={FALLBACK_MEDIA_HEIGHT}>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">Photo unavailable</Text>
        </MediaPlaceholder>
      )
    }
    const sticker = message.type === 'sticker'
    return (
      <>
        <ChatImageMedia
          uri={effectiveDisplayUrl}
          cacheKey={message.id}
          sticker={sticker}
          thumbhash={message.thumbhash}
          intrinsicWidth={message.mediaWidth ?? sessionDisplay?.width}
          intrinsicHeight={message.mediaHeight ?? sessionDisplay?.height}
          uploading={uploading}
          uploadLabel={sendOverlay ?? undefined}
          onPress={() => setImageFullScreen(true)}
          onLongPress={onLongPress}
          onMeasured={persistImageDimensions}
        />
        <MediaFullscreenViewer
          visible={imageFullScreen}
          uri={effectiveDisplayUrl}
          onClose={() => setImageFullScreen(false)}
          replyTo={message.replyTo}
          contactName={contactName}
          onReplyQuotePress={onReplyQuotePress}
        />
      </>
    )
  }

  if (message.type === 'video') {
    if (!effectiveDisplayUrl) {
      if (showMedia || sessionDisplay || isLoading || isDownloading) {
        return (
          <MediaPlaceholder minHeight={140}>
            <ActivityIndicator color="#00A884" size="small" />
          </MediaPlaceholder>
        )
      }
      return (
        <MediaPlaceholder minHeight={140}>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">Video unavailable</Text>
        </MediaPlaceholder>
      )
    }
    const openVideo = async () => {
      const local = await resolvePlaybackUri(message, remoteUrl)
      setVideoPlaybackUrl(local ?? effectiveDisplayUrl)
      setVideoFullScreen(true)
    }

    return (
      <>
        <ChatVideoMedia
          uri={effectiveDisplayUrl}
          messageId={message.id}
          active={showMedia}
          sizeBytes={fileSize}
          uploading={uploading}
          uploadLabel={sendOverlay ?? undefined}
          onPress={() => void openVideo()}
          onLongPress={onLongPress}
        />
        <VideoFullscreenViewer
          visible={videoFullScreen}
          url={videoPlaybackUrl ?? effectiveDisplayUrl}
          onClose={() => {
            setVideoFullScreen(false)
            setVideoPlaybackUrl(null)
          }}
          replyTo={message.replyTo}
          contactName={contactName}
          onReplyQuotePress={onReplyQuotePress}
        />
      </>
    )
  }

  if (message.type === 'audio') {
    const audioUri = effectivePlaybackUrl
    if (!audioUri) {
      const sending =
        outbound &&
        (message.status === 'pending' ||
          message.id.startsWith('pending-media-') ||
          !!message.sendPhase)
      if (sending) {
        return (
          <MediaPlaceholder minHeight={48}>
            <View className="flex-row items-center gap-3 px-1">
              <ActivityIndicator color="#00A884" size="small" />
              <View className="h-6 flex-1 flex-row items-end gap-0.5">
                {Array.from({ length: 24 }, (_, i) => (
                  <View
                    key={i}
                    className="w-[3px] rounded-sm bg-neutral-400/70 dark:bg-neutral-500/70"
                    style={{ height: 4 + (i % 5) * 3 }}
                  />
                ))}
              </View>
            </View>
          </MediaPlaceholder>
        )
      }
      return (
        <MediaPlaceholder minHeight={48}>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">Voice unavailable</Text>
        </MediaPlaceholder>
      )
    }
    return (
      <AudioPlayer
        uri={audioUri}
        messageId={message.id}
        conversationId={message.conversationId}
        variant={variant}
        resolvePlaybackUri={resolveUri}
        sentAt={message.sentAt}
        status={message.status}
        avatarName={outbound ? (agent?.name ?? 'You') : (contactName ?? 'Contact')}
        avatarUrl={outbound ? agent?.avatarUrl : contactAvatarUrl}
      />
    )
  }

  async function openDocument() {
    if (openingDoc) return
    if (!effectiveDisplayUrl && !remoteUrl && message.mediaUrl) {
      startManualDownload()
      return
    }
    setOpeningDoc(true)
    try {
      if (
        effectiveDisplayUrl &&
        (effectiveDisplayUrl.startsWith('file://') || effectiveDisplayUrl.startsWith('/'))
      ) {
        const { openLocalDocument } = await import('@/lib/openDocument')
        await openLocalDocument(
          effectiveDisplayUrl,
          message.mediaMimeType ?? 'application/octet-stream',
        )
        return
      }
      if (!remoteUrl && !effectiveDisplayUrl) return
      await openDocumentFromUrl(
        effectiveDisplayUrl ?? remoteUrl!,
        message.mediaFilename ?? 'document',
        message.mediaMimeType,
      )
    } catch {
      Alert.alert('Could not open file', 'Try again or download from a desktop browser.')
    } finally {
      setOpeningDoc(false)
    }
  }

  if (
    message.type === 'document' &&
    !effectiveDisplayUrl &&
    !localPreview &&
    message.mediaUrl &&
    !manualDownload &&
    autoAllowed === false
  ) {
    return (
      <MediaManualDownloadCard
        type="document"
        label={message.mediaFilename ?? 'Document'}
        sizeBytes={fileSize}
        hint={blockReason}
        downloading={isDownloading}
        onDownload={startManualDownload}
      />
    )
  }

  return (
    <DocumentBubble
      message={message}
      openingDoc={openingDoc}
      outbound={outbound}
      sizeBytes={fileSize}
      onOpen={() => void openDocument()}
      onLongPress={onLongPress}
    />
  )
}

const styles = StyleSheet.create({
  docRow: {
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  docIconWrap: {
    width: 44,
    height: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  docExt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  docBody: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  docNameOut: {
    color: '#e9edef',
  },
  docNameIn: {
    color: '#111b21',
  },
  docMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#8696a0',
    textTransform: 'lowercase',
  },
  docDownload: {
    flexShrink: 0,
    opacity: 0.85,
  },
})

export const MediaMessage = memo(MediaMessageBase, (prev, next) =>
  prev.variant === next.variant &&
  prev.contactName === next.contactName &&
  prev.contactAvatarUrl === next.contactAvatarUrl &&
  prev.onReplyQuotePress === next.onReplyQuotePress &&
  prev.onLongPress === next.onLongPress &&
  messageRenderEqual(prev.message, next.message),
)
