import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Keyboard,
  InteractionManager,
} from 'react-native'
import { FlatList } from 'react-native-gesture-handler'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated'
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import {
  MessageActionsOverlay,
  type MessageAnchor,
} from '@/components/MessageActionsOverlay'
import { ForwardMessageSheet } from '@/components/ForwardMessageSheet'
import { SwipeableMessageBubble } from '@/components/SwipeableMessageBubble'
import { ReplyQuoteBlock } from '@/components/ReplyQuoteBlock'
import { messageToReplyPreview } from '@/lib/replyPreview'
import { MessagingWindowTimer } from '@/components/MessagingWindowTimer'
import { messagingWindowState, showUnderHeaderBar } from '@/lib/messagingWindow'
import { AttachIcon, CloseIcon, KeyboardIcon, MicIcon, SendIcon } from '@/components/ChatIcons'
import { AttachPanel, ATTACH_TRAY_HEIGHT } from '@/components/AttachMenu'
import { MediaPreviewSheet, type PendingMedia } from '@/components/MediaPreviewSheet'
import {
  LocationPickerSheet,
  type PendingLocation,
} from '@/components/LocationPickerSheet'
import type { MessageLocation } from '@/lib/messageLocation'
import { VoiceRecordingWaveform } from '@/components/VoiceRecordingWaveform'
import { QueryError } from '@/components/QueryState'
import { useToast } from '@/components/Toast'
import { messageTypeFromMime, normalizeUploadMime } from '@/lib/mediaMime'
import { assertMediaUploadable } from '@/lib/waMediaLimits'
import {
  useConversation,
  useMessages,
  useSendText,
  useSendMedia,
  useResendMessage,
  useSendTemplate,
  useTemplates,
  useMarkRead,
  useUpdateConversation,
  useSendLocation,
  useForwardMessage,
  isNetworkError,
  type WaTemplate,
} from '@/hooks/useConversations'
import { useConversationRoom } from '@/hooks/useSocket'
import { useTeam } from '@/hooks/useTeam'
import { api, apiErrorMessage } from '@/services/api'
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  type VoiceRecording,
} from '@/lib/voiceRecording'
import { formatDuration } from '@/lib/format'
import { prepareMediaFileForUpload } from '@/lib/prepareUpload'
import { resolveUploadUri } from '@/lib/uploadUri'
import {
  playWaFeedback,
  playWaFeedbackAsync,
  warmWaFeedbackSounds,
} from '@/lib/waFeedbackSounds'
import { ChatScrollScrubber } from '@/components/ChatScrollScrubber'
import { ScrollToLatestButton } from '@/components/ScrollToLatestButton'
import type { Message } from '@/types'

const ReanimatedFlatList = Animated.createAnimatedComponent(
  FlatList,
) as typeof FlatList<Message>

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const conversationId = id as string
  const router = useRouter()
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const toast = useToast()

  const { data: conversation } = useConversation(conversationId)
  const {
    data: messagesData,
    isPending: messagesPending,
    isError: messagesError,
    error: messagesFetchError,
    refetch: refetchMessages,
  } = useMessages(conversationId)
  const sendText = useSendText(conversationId)
  const sendLocation = useSendLocation(conversationId)
  const sendMedia = useSendMedia(conversationId)
  const resendMessage = useResendMessage(conversationId)
  const markRead = useMarkRead()
  const update = useUpdateConversation(conversationId)

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [actionMessage, setActionMessage] = useState<Message | null>(null)
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)
  const forwardMutation = useForwardMessage()
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachPanelHeight, setAttachPanelHeight] = useState(ATTACH_TRAY_HEIGHT)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [attribOpen, setAttribOpen] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAt = useRef<number>(0)
  const voiceRecorder = useRef<VoiceRecording | null>(null)
  const [voiceRecorderLive, setVoiceRecorderLive] = useState<VoiceRecording | null>(null)
  const voiceStartInFlight = useRef(false)
  const messagesListRef = useAnimatedRef<FlatList<Message>>()
  const scrollY = useSharedValue(0)
  const maxScrollY = useSharedValue(0)
  const [scrubVisible, setScrubVisible] = useState(false)
  const [showScrollFab, setShowScrollFab] = useState(false)
  const scrubHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrubbingRef = useRef(false)
  const [listContentHeight, setListContentHeight] = useState(0)
  const [listViewportHeight, setListViewportHeight] = useState(0)
  const [listScrubbing, setListScrubbing] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const openMessageSwipeRef = useRef<Swipeable | null>(null)
  const retriedFailedMedia = useRef(new Set<string>())
  const draftInputRef = useRef<TextInput>(null)
  const pendingKeyboardFocus = useRef(false)
  const safeBottom = Math.max(insets.bottom, 8)
  const hideFooterSafePad = keyboardVisible || attachMenuOpen

  useConversationRoom(conversationId)

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardVisible(true))
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  function openAttachMenu() {
    runOnUI(() => {
      'worklet'
      const h =
        keyboardHeight.value > 50 ? keyboardHeight.value : ATTACH_TRAY_HEIGHT
      runOnJS(setAttachPanelHeight)(Math.round(h))
    })()
    setAttachMenuOpen(true)
    Keyboard.dismiss()
  }

  function closeAttachMenu() {
    pendingKeyboardFocus.current = false
    setAttachMenuOpen(false)
  }

  function focusComposerAfterAttachClose() {
    pendingKeyboardFocus.current = false
    draftInputRef.current?.focus()
  }

  function focusComposer() {
    if (attachMenuOpen) {
      pendingKeyboardFocus.current = true
      setAttachMenuOpen(false)
      return
    }
    draftInputRef.current?.focus()
  }

  const onMessageSwipeOpen = useCallback((messageId: string, ref: Swipeable | null) => {
    if (openMessageSwipeRef.current && openMessageSwipeRef.current !== ref) {
      openMessageSwipeRef.current.close()
    }
    openMessageSwipeRef.current = ref
  }, [])

  const onReplyToMessage = useCallback((m: Message) => {
    setReplyTo(m)
    focusComposer()
  }, [])

  /** + when idle/typing; keyboard icon only while the attach tray is open. */
  const showKeyboardIcon = attachMenuOpen

  function onComposerSidePress() {
    if (showKeyboardIcon) {
      focusComposer()
    } else {
      openAttachMenu()
    }
  }

  /** Run attach action without closing the tray (menu stays open). */
  function runAttachAction(action: () => void | Promise<void>) {
    void action()
  }

  // Re-queue downloads that failed earlier (e.g. DNS issues on the server).
  useEffect(() => {
    if (!isFocused || !messagesData?.messages) return
    for (const m of messagesData.messages) {
      if (m.type === 'text' || m.mediaStatus !== 'failed') continue
      if (retriedFailedMedia.current.has(m.id)) continue
      retriedFailedMedia.current.add(m.id)
      void api.post(`/messages/media/${m.id}/retry`).catch(() => undefined)
    }
  }, [isFocused, messagesData?.messages])

  useEffect(() => {
    if (!conversationId) return
    const task = InteractionManager.runAfterInteractions(() => {
      void warmWaFeedbackSounds()
      void markRead.mutateAsync(conversationId).catch(() => undefined)
    })
    return () => task.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current)
      if (voiceRecorder.current) void cancelVoiceRecording(voiceRecorder.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearRecordingUi() {
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current)
      recordingTimer.current = null
    }
    setRecordingOpen(false)
    setMicReady(false)
    setRecordingMs(0)
    setVoiceRecorderLive(null)
    recordingStartedAt.current = 0
  }

  function openRecordingUi() {
    setRecordingOpen(true)
    setMicReady(false)
    setRecordingMs(0)
    recordingStartedAt.current = Date.now()
    recordingTimer.current = setInterval(() => {
      setRecordingMs(Date.now() - recordingStartedAt.current)
    }, 250)
  }

  // Inverted list wants newest first; API returns oldest-first.
  const inverted = useMemo(
    () => (messagesData?.messages ?? []).slice().reverse(),
    [messagesData],
  )

  const bumpScrubVisible = useCallback(() => {
    setScrubVisible(true)
    if (scrubHideTimer.current) clearTimeout(scrubHideTimer.current)
    scrubHideTimer.current = setTimeout(() => {
      if (!scrubbingRef.current) setScrubVisible(false)
    }, 900)
  }, [])

  const updateScrollFab = useCallback((offsetY: number) => {
    setShowScrollFab(offsetY > 72)
  }, [])

  useEffect(() => {
    maxScrollY.value = Math.max(0, listContentHeight - listViewportHeight)
  }, [listContentHeight, listViewportHeight, maxScrollY])

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
      runOnJS(bumpScrubVisible)()
      runOnJS(updateScrollFab)(e.contentOffset.y)
    },
    onBeginDrag: () => {
      runOnJS(bumpScrubVisible)()
    },
  })

  const scrollToLatest = useCallback(() => {
    setShowScrollFab(false)
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
  }, [])

  const scrollToQuotedMessage = useCallback(
    (messageId: string) => {
      const index = inverted.findIndex((m) => m.id === messageId)
      if (index < 0) {
        toast.show('Original message is not in this chat', 'error')
        return
      }
      messagesListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      })
      setHighlightMessageId(messageId)
      setTimeout(() => setHighlightMessageId(null), 2200)
    },
    [inverted, toast],
  )

  const canSendSession = conversation?.canSendSession ?? conversation?.isWindowOpen ?? false
  const needsTemplate = conversation?.needsTemplateForReply ?? !canSendSession
  const contactName = conversation?.contact?.name || conversation?.contact?.waId || 'Chat'

  function onSendText() {
    const body = draft.trim()
    if (!body) return
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    setDraft('')
    setReplyTo(null)
    scrollToLatest()
    sendText.mutate(
      { body, replyToMessageId, replyToPreview },
      {
        onSuccess: (msg) => {
          scrollToLatest()
          if (msg.id.startsWith('pending-text-')) {
            toast.show('Offline — message will send when you are back online')
          } else {
            void playWaFeedback('send')
          }
        },
        onError: (err) => {
          if (isNetworkError(err)) {
            toast.show('Offline — message queued')
            scrollToLatest()
          } else {
            toast.show(apiErrorMessage(err), 'error')
            setDraft(body)
            if (savedReply) setReplyTo(savedReply)
          }
        },
      },
    )
  }

  async function onForwardToConversations(targetIds: string[]) {
    if (!forwardMessage || targetIds.length === 0) return
    try {
      const result = await forwardMutation.mutateAsync({
        messageId: forwardMessage.id,
        targetConversationIds: targetIds,
      })
      setForwardMessage(null)
      if (result.okCount === targetIds.length) {
        toast.show(
          `Forwarded to ${result.okCount} chat${result.okCount === 1 ? '' : 's'}`,
        )
      } else if (result.okCount > 0) {
        toast.show(`Sent to ${result.okCount} of ${targetIds.length} chats`, 'error')
      } else {
        toast.show('Could not forward message', 'error')
      }
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
  }

  function openLocationPreview() {
    setPendingLocation({ loading: true })
  }

  function cancelPendingLocation() {
    setPendingLocation(null)
  }

  function confirmPendingLocation(loc: MessageLocation & { name?: string }) {
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    setPendingLocation(null)
    if (replyToMessageId) setReplyTo(null)
    scrollToLatest()
    sendLocation.mutate(
      {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: loc.name,
        address: loc.address ?? undefined,
        replyToMessageId,
        replyToPreview,
      },
      {
        onSuccess: () => {
          scrollToLatest()
          void playWaFeedback('send')
        },
        onError: (err) => {
          toast.show(apiErrorMessage(err), 'error')
          if (savedReply) setReplyTo(savedReply)
        },
      },
    )
  }

  async function pickImage(fromCamera: boolean) {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        toast.show('Permission denied', 'error')
        return
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.8,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
            mediaTypes: ['images', 'videos'],
          })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`
      const mimeType = normalizeUploadMime(asset.mimeType ?? 'image/jpeg', name)
      const prepared = await prepareMediaFileForUpload(asset.uri, name, mimeType)
      setPendingMedia({
        uri: prepared.uri,
        name: prepared.name,
        mimeType: prepared.mimeType,
        type: messageTypeFromMime(prepared.mimeType),
      })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not open picker', 'error')
    }
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      })
      if (result.canceled) return
      const a = result.assets?.[0]
      if (!a?.uri) {
        toast.show('No file selected', 'error')
        return
      }
      const mimeType = normalizeUploadMime(a.mimeType ?? 'application/octet-stream', a.name)
      const uri = resolveUploadUri(a.uri)
      await assertMediaUploadable(uri, mimeType, a.name)
      setPendingMedia({
        uri,
        name: a.name || `document-${Date.now()}`,
        mimeType,
        type: 'document',
      })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not pick document', 'error')
    }
  }

  async function uploadAsset(
    uri: string,
    name: string,
    mimeType: string,
    caption?: string,
  ) {
    const normalized = normalizeUploadMime(mimeType, name)
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    if (replyToMessageId) setReplyTo(null)
    scrollToLatest()
    try {
      await sendMedia.mutateAsync({
        uri: resolveUploadUri(uri),
        name,
        mimeType: normalized,
        caption,
        replyToMessageId,
        replyToPreview,
      })
      setPendingMedia(null)
      scrollToLatest()
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
      if (savedReply) setReplyTo(savedReply)
      throw err
    }
  }

  function onRetryMessage(m: Message) {
    const stalePending =
      m.status === 'pending' &&
      Date.now() - new Date(m.sentAt).getTime() > 45_000
    if (m.status === 'pending' && !stalePending) return
    if (m.status !== 'failed' && !stalePending) return
    // Offline text queue is retried by the sync worker, not this handler.
    if (m.id.startsWith('pending-text-')) return

    const onError = (err: unknown) => {
      toast.show(apiErrorMessage(err), 'error')
    }

    if (m.localPreviewUri) {
      const name = m.mediaFilename ?? `resend-${Date.now()}`
      sendMedia.mutate(
        {
          uri: resolveUploadUri(m.localPreviewUri),
          name,
          mimeType: normalizeUploadMime(
            m.mediaMimeType ?? 'application/octet-stream',
            name,
          ),
          caption: m.body ?? undefined,
          replaceMessageId: m.id,
        },
        { onError },
      )
      return
    }

    resendMessage.mutate(m.id, { onError })
  }

  function confirmPendingMedia(caption?: string) {
    if (!pendingMedia) return
    const { uri, name, mimeType } = pendingMedia
    const normalized = normalizeUploadMime(mimeType, name)
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    setPendingMedia(null)
    if (replyToMessageId) setReplyTo(null)
    scrollToLatest()
    sendMedia.mutate(
      {
        uri: resolveUploadUri(uri),
        name,
        mimeType: normalized,
        caption,
        replyToMessageId,
        replyToPreview,
      },
      {
        onSuccess: () => scrollToLatest(),
        onError: (err) => {
          toast.show(apiErrorMessage(err), 'error')
          if (savedReply) setReplyTo(savedReply)
        },
      },
    )
  }

  async function startRecording() {
    if (recordingOpen || voiceStartInFlight.current) return
    voiceStartInFlight.current = true
    openRecordingUi()
    try {
      await playWaFeedbackAsync('recordStart')
      const rec = await startVoiceRecording()
      voiceRecorder.current = rec
      setVoiceRecorderLive(rec)
      setMicReady(true)
    } catch (err) {
      clearRecordingUi()
      voiceRecorder.current = null
      toast.show(err instanceof Error ? err.message : 'Could not start recording', 'error')
    } finally {
      voiceStartInFlight.current = false
    }
  }

  function cancelRecording() {
    playWaFeedback('recordCancel')
    const rec = voiceRecorder.current
    voiceRecorder.current = null
    clearRecordingUi()
    if (rec) void cancelVoiceRecording(rec)
  }

  async function finishVoiceRecording() {
    if (!recordingOpen) return
    const rec = voiceRecorder.current
    if (!rec) {
      toast.show('Microphone is still starting…', 'error')
      return
    }
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current)
      recordingTimer.current = null
    }
    const elapsedMs = recordingStartedAt.current
      ? Date.now() - recordingStartedAt.current
      : recordingMs
    try {
      const { uri, durationMs, filename, mimeType } = await stopVoiceRecording(rec, elapsedMs)
      voiceRecorder.current = null
      clearRecordingUi()
      if (durationMs < 500) {
        toast.show('Record a longer message (at least 1 second)', 'error')
        return
      }
      setSendingVoice(true)
      await playWaFeedbackAsync('send')
      try {
        await uploadAsset(uri, filename, mimeType)
      } catch {
        /* toast shown in uploadAsset */
      } finally {
        setSendingVoice(false)
      }
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
      voiceRecorder.current = null
      clearRecordingUi()
    }
  }

  const previewMedia =
    pendingMedia && pendingMedia.type !== 'audio' ? pendingMedia : null

  const showMessagesLoader = isFocused && messagesPending && !messagesData

  async function resolveConversation() {
    try {
      await update.mutateAsync({ status: 'resolved' })
      toast.show('Conversation resolved', 'success')
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-wa-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 bg-wa-teal px-4 py-3 shadow-sm">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
        >
          <Text className="text-xl leading-none text-white">‹</Text>
        </Pressable>
        <View className="min-w-0 flex-1 justify-center">
          <Text numberOfLines={1} className="text-[17px] font-semibold text-white">
            {contactName}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-xs text-white/75">
            {conversation?.status ?? '—'}
          </Text>
        </View>
        {conversation ? <MessagingWindowTimer conversation={conversation} variant="header" /> : null}
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
        >
          <Text className="text-lg text-white">⋮</Text>
        </Pressable>
      </View>

      {(() => {
        const windowState = conversation ? messagingWindowState(conversation) : null
        if (!windowState || !showUnderHeaderBar(windowState)) return null
        return <MessagingWindowTimer conversation={conversation} variant="banner" />
      })()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View className="min-h-0 flex-1">
          {messagesError ? (
            <QueryError
              message={`${apiErrorMessage(messagesFetchError)}. Check that the backend is running and EXPO_PUBLIC_API_URL in mobile/.env matches your PC IP (same Wi‑Fi as the phone).`}
              onRetry={() => void refetchMessages()}
            />
          ) : showMessagesLoader ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#128C7E" />
            </View>
          ) : (
            <View className="min-h-0 flex-1" onLayout={(e) => setListViewportHeight(e.nativeEvent.layout.height)}>
            <ReanimatedFlatList
              ref={messagesListRef}
              data={inverted}
              inverted
              scrollEnabled={!listScrubbing}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              directionalLockEnabled
              showsVerticalScrollIndicator={false}
              onContentSizeChange={(_w, h) => setListContentHeight(h)}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              onScrollToIndexFailed={({ index }) => {
                messagesListRef.current?.scrollToOffset({
                  offset: Math.max(0, index * 72),
                  animated: true,
                })
              }}
              renderItem={({ item }: { item: Message }) => (
                <SwipeableMessageBubble
                  message={item}
                  contactName={contactName}
                  onReply={onReplyToMessage}
                  onReplyQuotePress={scrollToQuotedMessage}
                  highlight={highlightMessageId === item.id}
                  onSwipeOpen={onMessageSwipeOpen}
                  onRetry={(m) => void onRetryMessage(m)}
                  onLongPress={(m, anchor) => {
                    setActionMessage(m)
                    setActionAnchor(anchor)
                    setActionsOpen(true)
                  }}
                />
              )}
              contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 6 }}
            />
            <ScrollToLatestButton
              visible={showScrollFab && !recordingOpen}
              onPress={scrollToLatest}
              bottomInset={12}
            />
            <ChatScrollScrubber
              listRef={messagesListRef}
              messages={inverted}
              contentHeight={listContentHeight}
              viewportHeight={listViewportHeight}
              scrollY={scrollY}
              maxOffset={maxScrollY}
              visible={scrubVisible}
              onScrollActivity={bumpScrubVisible}
              onScrollOffset={updateScrollFab}
              onScrubbingChange={(scrubbing) => {
                scrubbingRef.current = scrubbing
                setListScrubbing(scrubbing)
                if (scrubbing) setScrubVisible(true)
              }}
            />
            </View>
          )}
          {attachMenuOpen ? (
            <Pressable
              onPress={closeAttachMenu}
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Close attachments"
            />
          ) : null}
        </View>

        <View
          style={{
            backgroundColor: '#ffffff',
            paddingBottom: hideFooterSafePad ? 0 : safeBottom,
          }}
        >
          {canSendSession ? (
          recordingOpen ? (
            <View className="bg-white px-4 py-3">
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={cancelRecording}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-neutral-100"
                >
                  <CloseIcon />
                </Pressable>
                <View className="h-11 flex-1 flex-row items-center gap-2 rounded-2xl bg-neutral-100 px-3">
                  <View className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <VoiceRecordingWaveform
                    recorder={voiceRecorderLive}
                    active={micReady}
                  />
                  <Text className="shrink-0 text-sm font-medium tabular-nums text-neutral-700">
                    {formatDuration(recordingMs / 1000)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void finishVoiceRecording()}
                  disabled={!micReady || sendMedia.isPending || sendingVoice}
                  className={`h-11 w-11 items-center justify-center rounded-full shadow-sm ${
                    micReady ? 'bg-wa-teal' : 'bg-neutral-300'
                  }`}
                >
                  {sendMedia.isPending || sendingVoice ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <SendIcon />
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View
              className={`bg-white ${attachMenuOpen ? '' : 'border-t border-neutral-100'}`}
            >
              {replyTo ? (
                <View className="flex-row items-center gap-2 border-b border-neutral-100 px-3 py-2">
                  <View className="flex-1">
                    <ReplyQuoteBlock
                      reply={messageToReplyPreview(replyTo)}
                      contactName={contactName}
                      isOutboundBubble={false}
                    />
                  </View>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Text className="text-lg text-neutral-400">✕</Text>
                  </Pressable>
                </View>
              ) : null}
            <View className="flex-row items-end gap-2 px-3 py-2.5">
              <Pressable
                onPress={onComposerSidePress}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={
                  showKeyboardIcon ? 'Show keyboard' : 'Attach file'
                }
                className="mb-1 h-10 w-10 items-center justify-center rounded-full bg-neutral-100"
              >
                {showKeyboardIcon ? <KeyboardIcon /> : <AttachIcon />}
              </Pressable>
              <Pressable
                style={{ flex: 1 }}
                pointerEvents={attachMenuOpen ? 'auto' : 'box-none'}
                onPress={attachMenuOpen ? () => focusComposer() : undefined}
              >
                <TextInput
                  ref={draftInputRef}
                  value={draft}
                  onChangeText={setDraft}
                  onFocus={() => setKeyboardVisible(true)}
                  onBlur={() => {
                    setTimeout(() => setKeyboardVisible(false), 120)
                  }}
                  showSoftInputOnFocus={!attachMenuOpen}
                  editable={!attachMenuOpen}
                  pointerEvents={attachMenuOpen ? 'none' : 'auto'}
                  placeholder="Type a message"
                  multiline
                  className="max-h-28 min-h-[44px] flex-1 rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[15px] leading-5 text-neutral-900"
                  placeholderTextColor="#9ca3af"
                />
              </Pressable>
              {draft.trim() ? (
                <Pressable
                  onPress={onSendText}
                  disabled={sendText.isPending}
                  className="mb-0.5 h-11 w-11 items-center justify-center rounded-full bg-wa-teal shadow-sm"
                >
                  <SendIcon />
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void startRecording()}
                  disabled={sendMedia.isPending || recordingOpen}
                  className="mb-0.5 h-11 w-11 items-center justify-center rounded-full bg-wa-teal shadow-sm"
                >
                  <MicIcon />
                </Pressable>
              )}
            </View>
            </View>
          )
        ) : needsTemplate ? (
          <View className="bg-white px-4 py-3">
            <Pressable
              onPress={() => setTemplateOpen(true)}
              className="items-center rounded-xl bg-wa-teal py-3"
            >
              <Text className="font-semibold text-white">
                {conversation?.isFepOpen && conversation?.isCtwaLead
                  ? 'Send template (free in CTWA window)'
                  : 'Send a Message Template'}
              </Text>
            </Pressable>
          </View>
        ) : null}

          <AttachPanel
            open={attachMenuOpen}
            targetHeight={attachPanelHeight}
            onCloseComplete={() => {
              if (pendingKeyboardFocus.current) {
                focusComposerAfterAttachClose()
              }
            }}
            onCamera={() => runAttachAction(() => pickImage(true))}
            onGallery={() => runAttachAction(() => pickImage(false))}
            onDocument={() => runAttachAction(() => pickDocument())}
            onLocation={() => runAttachAction(() => void openLocationPreview())}
          />
        </View>
      </KeyboardAvoidingView>

      <MessageActionsOverlay
        message={actionMessage}
        anchor={actionAnchor}
        contactName={contactName}
        visible={actionsOpen}
        onClose={() => {
          setActionsOpen(false)
          setActionAnchor(null)
        }}
        onReply={onReplyToMessage}
        onForward={(m) => setForwardMessage(m)}
      />

      <ForwardMessageSheet
        open={forwardMessage != null}
        message={forwardMessage}
        contactName={contactName}
        currentConversationId={conversationId}
        forwarding={forwardMutation.isPending}
        onClose={() => setForwardMessage(null)}
        onForward={(ids) => void onForwardToConversations(ids)}
      />

      <OverflowMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onResolve={() => {
          setMenuOpen(false)
          void resolveConversation()
        }}
        onAssign={() => {
          setMenuOpen(false)
          setAssignOpen(true)
        }}
        onAttribution={() => {
          setMenuOpen(false)
          setAttribOpen(true)
        }}
      />

      <AssignSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        conversationId={conversationId}
        onAssigned={() => setAssignOpen(false)}
      />

      <TemplateSheet
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        conversationId={conversationId}
      />

      <AttributionSheet
        open={attribOpen}
        onClose={() => setAttribOpen(false)}
        adTitle={conversation?.adTitle ?? null}
        adBody={conversation?.adBody ?? null}
        sourceUrl={conversation?.referralSourceUrl ?? null}
        sourceType={conversation?.referralSourceType ?? null}
        ctwaClid={conversation?.ctwaClid ?? null}
      />

      <MediaPreviewSheet
        media={previewMedia}
        onCancel={() => setPendingMedia(null)}
        onSend={(caption) => confirmPendingMedia(caption)}
      />

      <LocationPickerSheet
        open={pendingLocation != null}
        sending={sendLocation.isPending}
        onCancel={cancelPendingLocation}
        onSend={confirmPendingLocation}
        onPermissionDenied={() => toast.show('Location permission denied', 'error')}
      />
    </SafeAreaView>
  )
}

// --- Sub-sheets ---------------------------------------------------------------

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View className="rounded-t-2xl bg-white pb-8 pt-2">{children}</View>
      </View>
    </Modal>
  )
}

function Row({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} className="px-5 py-4 active:bg-neutral-50">
      <Text className={`text-base ${danger ? 'text-red-600' : 'text-neutral-800'}`}>{label}</Text>
    </Pressable>
  )
}

function OverflowMenu({
  open,
  onClose,
  onResolve,
  onAssign,
  onAttribution,
}: {
  open: boolean
  onClose: () => void
  onResolve: () => void
  onAssign: () => void
  onAttribution: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Row label="✓  Resolve" onPress={onResolve} />
      <Row label="👤  Assign to…" onPress={onAssign} />
      <Row label="📊  View attribution" onPress={onAttribution} />
    </BottomSheet>
  )
}

function AssignSheet({
  open,
  onClose,
  conversationId,
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
  onAssigned: () => void
}) {
  const { data } = useTeam()
  const update = useUpdateConversation(conversationId)
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Assign to
      </Text>
      <ScrollView style={{ maxHeight: 320 }}>
        {data?.members.map((m) => (
          <Row
            key={m.id}
            label={`${m.isOnline ? '🟢' : '⚪'}  ${m.name}`}
            onPress={async () => {
              try {
                await update.mutateAsync({ assignedTo: m.id })
                toast.show(`Assigned to ${m.name}`, 'success')
                onAssigned()
              } catch (err) {
                toast.show(apiErrorMessage(err), 'error')
              }
            }}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  )
}

function TemplateSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
}) {
  const { data, isLoading } = useTemplates(open)
  const send = useSendTemplate(conversationId)
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Message templates
      </Text>
      {isLoading ? (
        <ActivityIndicator className="py-6" color="#128C7E" />
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          {(data ?? []).map((t: WaTemplate) => (
            <Row
              key={`${t.name}-${t.language}`}
              label={`${t.name}  (${t.language})`}
              onPress={async () => {
                try {
                  await send.mutateAsync({ templateName: t.name, languageCode: t.language })
                  toast.show('Template sent', 'success')
                  onClose()
                } catch (err) {
                  toast.show(apiErrorMessage(err), 'error')
                }
              }}
            />
          ))}
          {(data ?? []).length === 0 && (
            <Text className="px-5 py-6 text-center text-neutral-400">
              No approved templates found.
            </Text>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

function AttributionSheet({
  open,
  onClose,
  adTitle,
  adBody,
  sourceUrl,
  sourceType,
  ctwaClid,
}: {
  open: boolean
  onClose: () => void
  adTitle: string | null
  adBody: string | null
  sourceUrl: string | null
  sourceType: string | null
  ctwaClid: string | null
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Click-to-WhatsApp attribution
      </Text>
      <View className="gap-2 px-5 py-2">
        <Field label="Ad title" value={adTitle} />
        <Field label="Ad body" value={adBody} />
        <Field label="Source type" value={sourceType} />
        <Field label="Source URL" value={sourceUrl} />
        <Field label="CTWA click id" value={ctwaClid} />
        {!ctwaClid && (
          <Text className="py-2 text-neutral-400">No ad attribution for this conversation.</Text>
        )}
      </View>
    </BottomSheet>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <View>
      <Text className="text-xs text-neutral-400">{label}</Text>
      <Text className="text-[15px] text-neutral-800">{value}</Text>
    </View>
  )
}
