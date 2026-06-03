import { useState, type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Dimensions,
  Alert,
  StyleSheet,
} from 'react-native'
import { Image } from 'expo-image'
import { useMediaUrl } from '@/hooks/useMedia'
import { api } from '@/services/api'
import { openDocumentFromUrl } from '@/lib/openDocument'
import { DocumentIcon } from '@/components/ChatIcons'
import { AudioPlayer } from './AudioPlayer'
import { ChatVideo } from './ChatVideo'
import type { Message } from '@/types'

const { width: SCREEN_W } = Dimensions.get('window')
const IMAGE_SIZE = Math.min(SCREEN_W * 0.62, 240)
const STICKER_SIZE = 144

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
}: {
  message: Message
  variant?: 'inbound' | 'outbound'
}) {
  const localPreview = message.localPreviewUri
  const pending = message.mediaStatus === 'pending'
  const failed = message.mediaStatus === 'failed'
  const hasRemoteKey = !!message.mediaUrl && !pending && !failed
  const { data: url, isLoading, isError } = useMediaUrl(hasRemoteKey ? message.mediaUrl : null)
  // Prefer S3 presigned URL once uploaded; local file is only for in-flight uploads.
  const displayUrl = hasRemoteKey ? url ?? localPreview : localPreview
  const [fullScreen, setFullScreen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [openingDoc, setOpeningDoc] = useState(false)
  const [imageError, setImageError] = useState(false)

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

  if (pending && !localPreview) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 48 : 140}>
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

  if (failed && !localPreview) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 48 : 140}>
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

  if (!displayUrl && (isLoading || hasRemoteKey)) {
    return (
      <MediaPlaceholder minHeight={message.type === 'audio' ? 48 : IMAGE_SIZE}>
        <ActivityIndicator color="#128C7E" />
      </MediaPlaceholder>
    )
  }

  if (!displayUrl && isError) {
    return (
      <MediaPlaceholder minHeight={IMAGE_SIZE}>
        <Text className="text-sm text-red-600">Could not load media</Text>
      </MediaPlaceholder>
    )
  }

  if (message.type === 'image' || message.type === 'sticker') {
    const size = message.type === 'sticker' ? STICKER_SIZE : IMAGE_SIZE
    if (!displayUrl || imageError) {
      return (
        <MediaPlaceholder minHeight={size} minWidth={size}>
          <Text className="text-sm text-neutral-500">Photo unavailable</Text>
        </MediaPlaceholder>
      )
    }
    return (
      <>
        <Pressable onPress={() => setFullScreen(true)} style={styles.imageWrap}>
          <Image
            source={{ uri: displayUrl }}
            style={{ width: size, height: size, borderRadius: 12 }}
            contentFit="cover"
            transition={150}
            onError={() => setImageError(true)}
          />
        </Pressable>
        <Modal visible={fullScreen} transparent onRequestClose={() => setFullScreen(false)}>
          <Pressable
            onPress={() => setFullScreen(false)}
            className="flex-1 items-center justify-center bg-black"
          >
            <Image
              source={{ uri: displayUrl }}
              style={{ width: SCREEN_W, height: SCREEN_W }}
              contentFit="contain"
            />
          </Pressable>
        </Modal>
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
    return <ChatVideo url={displayUrl} />
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
        uri={displayUrl}
        messageId={message.id}
        conversationId={message.conversationId}
        variant={variant}
      />
    )
  }

  async function openDocument() {
    if (openingDoc) return
    setOpeningDoc(true)
    try {
      if (localPreview) {
        const { openLocalDocument } = await import('@/lib/openDocument')
        await openLocalDocument(
          localPreview,
          message.mediaMimeType ?? 'application/octet-stream',
        )
        return
      }
      if (!url) return
      await openDocumentFromUrl(
        url,
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

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
    borderRadius: 12,
  },
})
