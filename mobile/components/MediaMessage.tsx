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
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { openDocumentFromUrl } from '@/lib/openDocument'
import { BUBBLE_MEDIA_MAX_WIDTH } from '@/lib/chatMediaLayout'
import { useMessageMedia } from '@/hooks/useMessageMedia'
import { syncMessageMedia } from '@/lib/messageMediaSync'
import { resolvePlaybackUri } from '@/lib/mediaPlayback'
import { AudioPlayer } from './AudioPlayer'
import { ChatVideoMedia } from './ChatVideoMedia'
import { ChatImageMedia } from './ChatImageMedia'
import { MediaFullscreenViewer } from './MediaFullscreenViewer'
import { VideoFullscreenViewer } from './VideoFullscreenViewer'
import { mediaSendOverlayLabel } from '@/lib/mediaSendPhase'
import { messageTypeToDownloadKind, getMediaDownloadPrefs } from '@/lib/mediaDownloadPrefs'
import { isOnWifi } from '@/lib/network'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
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
  outbound,
}: {
  message: Message
  openingDoc: boolean
  onOpen: () => void
  outbound: boolean
}) {
  const ext = fileExtension(message.mediaFilename, message.mediaMimeType)
  const isPdf = ext === 'pdf'
  const iconColor = isPdf ? '#e53935' : '#00A884'

  return (
    <Pressable
      onPress={onOpen}
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
        <Text style={styles.docMeta}>{ext}</Text>
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
}: {
  message: Message
  variant?: 'inbound' | 'outbound'
  contactName?: string
  contactAvatarUrl?: string | null
  onReplyQuotePress?: (messageId: string) => void
}) {
  const agent = useAuthStore((s) => s.agent)
  const localPreview = message.localPreviewUri
  const pending = message.mediaStatus === 'pending'
  const mediaDownloadFailed = message.mediaStatus === 'failed' && !message.mediaUrl
  const sendOverlay = variant === 'outbound' ? mediaSendOverlayLabel(message) : null
  const uploading = !!sendOverlay

  const { displayUrl, playbackUrl, remoteUrl, isLoading, isError } = useMessageMedia(message)
  const [downloadBlocked, setDownloadBlocked] = useState(false)
  const [manualDownload, setManualDownload] = useState(false)

  useEffect(() => {
    if (variant === 'outbound' || pending || displayUrl) {
      setDownloadBlocked(false)
      return
    }
    void (async () => {
      const kind = messageTypeToDownloadKind(message.type)
      if (!kind) return
      const prefs = await getMediaDownloadPrefs()
      const policy = prefs[kind]
      if (policy === 'never') {
        setDownloadBlocked(true)
        return
      }
      if (policy === 'wifi' && !(await isOnWifi())) {
        setDownloadBlocked(true)
        return
      }
      setDownloadBlocked(false)
    })()
  }, [variant, pending, displayUrl, message.type])

  const resolveUri = useCallback(
    () => resolvePlaybackUri(message, remoteUrl),
    [message, remoteUrl],
  )

  const [imageFullScreen, setImageFullScreen] = useState(false)
  const [videoFullScreen, setVideoFullScreen] = useState(false)
  const [videoPlaybackUrl, setVideoPlaybackUrl] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [openingDoc, setOpeningDoc] = useState(false)

  async function retryDownload() {
    if (retrying) return
    setRetrying(true)
    try {
      if (mediaDownloadFailed || message.mediaStatus === 'failed') {
        await api.post(`/messages/media/${message.id}/retry`)
      } else {
        await syncMessageMedia(message, { force: true })
      }
    } catch {
      /* parent refetch / socket will update when job completes */
    } finally {
      setRetrying(false)
    }
  }

  const pendingLabel =
    message.type === 'image' || message.type === 'sticker'
      ? 'Photo'
      : message.type === 'video'
        ? 'Video'
        : message.type === 'audio'
          ? 'Voice message'
          : message.type === 'document'
            ? message.mediaFilename ?? 'Document'
            : 'Media'

  if (downloadBlocked && !displayUrl && !localPreview && !manualDownload && message.mediaUrl) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : 140}>
        <Text className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {pendingLabel}
        </Text>
        <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Tap to download
        </Text>
        <Pressable
          onPress={() => {
            setManualDownload(true)
            void syncMessageMedia(message, { force: true })
          }}
          className="mt-3 rounded-full bg-wa-teal px-4 py-2"
        >
          <Text className="text-xs font-semibold text-white">Download</Text>
        </Pressable>
      </MediaPlaceholder>
    )
  }

  if (pending && !localPreview && !displayUrl) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : 140}>
        <ActivityIndicator color="#00A884" />
        <Text className="mt-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {pendingLabel}
        </Text>
        <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Downloading…
        </Text>
      </MediaPlaceholder>
    )
  }

  if (mediaDownloadFailed && !localPreview && !displayUrl) {
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

  if (!displayUrl && isLoading) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : FALLBACK_MEDIA_HEIGHT}>
        <ActivityIndicator color="#00A884" />
      </MediaPlaceholder>
    )
  }

  if (!displayUrl && isError) {
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
    if (!displayUrl) {
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
          uri={displayUrl}
          sticker={sticker}
          uploading={uploading}
          uploadLabel={sendOverlay ?? undefined}
          onPress={() => setImageFullScreen(true)}
        />
        <MediaFullscreenViewer
          visible={imageFullScreen}
          uri={displayUrl}
          onClose={() => setImageFullScreen(false)}
          replyTo={message.replyTo}
          contactName={contactName}
          onReplyQuotePress={onReplyQuotePress}
        />
      </>
    )
  }

  if (message.type === 'video') {
    if (!displayUrl) {
      return (
        <MediaPlaceholder minHeight={140}>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">Video unavailable</Text>
        </MediaPlaceholder>
      )
    }
    const openVideo = async () => {
      const local = await resolvePlaybackUri(message, remoteUrl)
      setVideoPlaybackUrl(local ?? displayUrl)
      setVideoFullScreen(true)
    }

    return (
      <>
        <ChatVideoMedia
          uri={displayUrl}
          messageId={message.id}
          uploading={uploading}
          uploadLabel={sendOverlay ?? undefined}
          onPress={() => void openVideo()}
        />
        <VideoFullscreenViewer
          visible={videoFullScreen}
          url={videoPlaybackUrl ?? displayUrl}
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
    const audioUri = playbackUrl ?? displayUrl
    if (!audioUri) {
      if (isLoading) {
        return (
          <MediaPlaceholder minHeight={48}>
            <ActivityIndicator color="#00A884" size="small" />
          </MediaPlaceholder>
        )
      }
      return (
        <MediaPlaceholder minHeight={48}>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">Voice unavailable</Text>
        </MediaPlaceholder>
      )
    }
    const outbound = variant === 'outbound'
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
    setOpeningDoc(true)
    try {
      if (displayUrl && (displayUrl.startsWith('file://') || displayUrl.startsWith('/'))) {
        const { openLocalDocument } = await import('@/lib/openDocument')
        await openLocalDocument(
          displayUrl,
          message.mediaMimeType ?? 'application/octet-stream',
        )
        return
      }
      if (!remoteUrl && !displayUrl) return
      await openDocumentFromUrl(
        displayUrl ?? remoteUrl!,
        message.mediaFilename ?? 'document',
        message.mediaMimeType,
      )
    } catch {
      Alert.alert('Could not open file', 'Try again or download from a desktop browser.')
    } finally {
      setOpeningDoc(false)
    }
  }

  return (
    <DocumentBubble
      message={message}
      openingDoc={openingDoc}
      outbound={variant === 'outbound'}
      onOpen={() => void openDocument()}
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
  messageRenderEqual(prev.message, next.message),
)
