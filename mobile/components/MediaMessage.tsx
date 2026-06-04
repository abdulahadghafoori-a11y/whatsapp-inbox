import { useCallback, useState, type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { api } from '@/services/api'
import { openDocumentFromUrl } from '@/lib/openDocument'
import { BUBBLE_MEDIA_MAX_WIDTH } from '@/lib/chatMediaLayout'
import { useMessageMedia } from '@/hooks/useMessageMedia'
import { resolvePlaybackUri } from '@/lib/mediaPlayback'
import { DocumentIcon } from '@/components/ChatIcons'
import { AudioPlayer } from './AudioPlayer'
import { ChatVideoMedia } from './ChatVideoMedia'
import { ChatImageMedia } from './ChatImageMedia'
import { MediaFullscreenViewer } from './MediaFullscreenViewer'
import { VideoFullscreenViewer } from './VideoFullscreenViewer'
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

export function MediaMessage({
  message,
  variant = 'inbound',
  contactName,
  onReplyQuotePress,
}: {
  message: Message
  variant?: 'inbound' | 'outbound'
  contactName?: string
  onReplyQuotePress?: (messageId: string) => void
}) {
  const localPreview = message.localPreviewUri
  const pending = message.mediaStatus === 'pending'
  const mediaDownloadFailed = message.mediaStatus === 'failed' && !message.mediaUrl
  const uploading =
    variant === 'outbound' && message.status === 'pending' && !!localPreview

  const { displayUrl, playbackUrl, remoteUrl, isLoading, isError } = useMessageMedia(message)

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
      await api.post(`/messages/media/${message.id}/retry`)
    } catch {
      /* parent refetch / socket will update when job completes */
    } finally {
      setRetrying(false)
    }
  }

  if (pending && !localPreview && !displayUrl) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 40 : 140}>
        <ActivityIndicator color="#128C7E" />
        <Text className="mt-2 text-sm text-neutral-500">
          {retrying ? 'Retrying…' : 'Downloading…'}
        </Text>
        <Pressable
          onPress={() => void retryDownload()}
          className="mt-3 rounded-full bg-wa-teal/10 px-4 py-2"
        >
          <Text className="text-xs font-semibold text-wa-teal">Tap to retry</Text>
        </Pressable>
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
        <ActivityIndicator color="#128C7E" />
      </MediaPlaceholder>
    )
  }

  if (!displayUrl && isError) {
    return (
      <MediaPlaceholder minHeight={FALLBACK_MEDIA_HEIGHT}>
        <Text className="text-sm text-red-600">Could not load media</Text>
      </MediaPlaceholder>
    )
  }

  if (message.type === 'image' || message.type === 'sticker') {
    if (!displayUrl) {
      return (
        <MediaPlaceholder minHeight={FALLBACK_MEDIA_HEIGHT}>
          <Text className="text-sm text-neutral-500">Photo unavailable</Text>
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
          <Text className="text-sm text-neutral-500">Video unavailable</Text>
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
    if (!displayUrl) {
      return (
        <MediaPlaceholder minHeight={48}>
          <Text className="text-sm text-neutral-500">Voice unavailable</Text>
        </MediaPlaceholder>
      )
    }
    return (
      <AudioPlayer
        uri={playbackUrl ?? displayUrl}
        messageId={message.id}
        conversationId={message.conversationId}
        variant={variant}
        resolvePlaybackUri={resolveUri}
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
    <Pressable
      onPress={() => void openDocument()}
      disabled={openingDoc}
      className="min-w-[220px] flex-row items-center gap-3 rounded-xl border border-black/5 bg-white/60 px-4 py-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-wa-teal/15">
        {openingDoc ? (
          <ActivityIndicator color="#128C7E" size="small" />
        ) : (
          <DocumentIcon size={22} />
        )}
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-neutral-800">
          {message.mediaFilename ?? 'Document'}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500">Tap to open</Text>
      </View>
    </Pressable>
  )
}
