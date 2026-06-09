import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  InteractionManager,
} from 'react-native'
import type { FlatList } from 'react-native-gesture-handler'
import type Swipeable from 'react-native-gesture-handler/Swipeable'
import { runOnJS, runOnUI } from 'react-native-reanimated'
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'nativewind'
import { useIsFocused } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import {
  MessageActionsOverlay,
  type MessageAnchor,
} from '@/components/MessageActionsOverlay'
import { Avatar } from '@/components/Avatar'
import { PressableScale } from '@/components/PressableScale'
import { hapticLight, hapticMedium, hapticWarning } from '@/lib/haptics'
import { clearDraft, loadDraft, saveDraft } from '@/lib/drafts'
import { newPendingId } from '@/lib/clientId'
import { ForwardMessageSheet } from '@/components/ForwardMessageSheet'
import { ChatMessagesList } from '@/components/ChatMessagesList'
import { ReplyQuoteBlock } from '@/components/ReplyQuoteBlock'
import { messageToReplyPreview } from '@/lib/replyPreview'
import { MessagingWindowTimer } from '@/components/MessagingWindowTimer'
import { messagingWindowState, showUnderHeaderBar } from '@/lib/messagingWindow'
import { KeyboardIcon } from '@/components/ChatIcons'
import { AttachPanel, ATTACH_TRAY_HEIGHT } from '@/components/AttachMenu'
import { MediaPreviewSheet, type PendingMedia } from '@/components/MediaPreviewSheet'
import { VideoTrimSheet, type VideoTrimSource } from '@/components/VideoTrimSheet'
import { getVideoSourceInfo, videoNeedsTrim } from '@/lib/prepareVideoForSend'
import { isStalePendingMessage } from '@/lib/messageStalePending'
import {
  LocationPickerSheet,
  type PendingLocation,
} from '@/components/LocationPickerSheet'
import type { MessageLocation } from '@/lib/messageLocation'
import { VoiceRecordingWaveform } from '@/components/VoiceRecordingWaveform'
import { VoiceRecordButton } from '@/components/VoiceRecordButton'
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
  useMarkRead,
  useUpdateConversation,
  useSendLocation,
  useForwardMessage,
  isNetworkError,
  buildOptimisticMediaMessage,
} from '@/hooks/useConversations'
import { useConversationRoom } from '@/hooks/useSocket'
import { useTypingEmitter, useTypingIndicator } from '@/hooks/useTyping'
import { useMessageSearch } from '@/hooks/useConversations'
import { useDeepLinkScrollToMessage } from '@/hooks/useDeepLinkScrollToMessage'
import {
  useToggleMessageReaction,
  useToggleMessageStar,
} from '@/hooks/useMessageFeatures'
import { scrollToChatMessage } from '@/lib/scrollToChatMessage'
import {
  AssignSheet,
  AttributionSheet,
  OverflowMenu,
  RecordingPulse,
  TemplateSheet,
} from '@/components/conversation/ConversationSheets'
import { api, apiErrorMessage } from '@/services/api'
import { mediaSendErrorMessage } from '@/lib/mediaSendErrors'
import { readClientSendMeta } from '@/lib/mediaSendMeta'
import { userFacingLoadError } from '@/lib/userFacingError'
import { SocketConnectionBanner } from '@/components/SocketConnectionBanner'
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  warmVoiceRecorder,
  type VoiceRecording,
} from '@/lib/voiceRecording'
import {
  deleteMessages,
  patchLocalMessage,
  putOptimisticOutboundMessage,
} from '@/lib/db/repo'
import { formatDuration } from '@/lib/format'
import { prepareMediaFileForUpload } from '@/lib/prepareUpload'
import { cacheMediaFromLocalFile, ensureMediaIndexLoaded } from '@/lib/messageMediaCache'
import { chatStateCache } from '@/lib/chatStateCache'
import { resolveUploadUri } from '@/lib/uploadUri'
import { buildVoiceNoteRuns } from '@/lib/voiceNoteQueue'
import {
  playWaFeedback,
  warmWaFeedbackSounds,
} from '@/lib/waFeedbackSounds'
import { ScrollToLatestButton } from '@/components/ScrollToLatestButton'
import { useGlobalAudioStore } from '@/stores/globalAudioStore'
import { ChatDatePill, ChatStickyDateBar } from '@/components/ChatDatePill'
import {
  buildChatListItems,
  stabilizeChatListItems,
  type ChatListItem,
} from '@/lib/chatListItems'
import { formatDateLabel } from '@/lib/format'
import type { Message } from '@/types'
export default function ChatScreen() {
  const { id, messageId: deepLinkMessageId } = useLocalSearchParams<{
    id: string
    messageId?: string
  }>()
  const conversationId = id as string
  const router = useRouter()
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const toast = useToast()

  const { data: conversation } = useConversation(conversationId)
  const {
    data: messagesData,
    isPending: messagesPending,
    isError: messagesError,
    error: messagesFetchError,
    refetch: refetchMessages,
    fetchOlderMessages,
    hasOlderMessages,
    isFetchingOlder,
    threadLimit,
  } = useMessages(conversationId)
  const sendText = useSendText(conversationId)
  const sendLocation = useSendLocation(conversationId)
  const sendMedia = useSendMedia(conversationId)
  const resendMessage = useResendMessage(conversationId)
  const markRead = useMarkRead()
  const update = useUpdateConversation(conversationId)

  const [draft, setDraft] = useState('')
  const draftLoadedRef = useRef(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [actionMessage, setActionMessage] = useState<Message | null>(null)
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)
  const forwardMutation = useForwardMessage()
  const toggleStar = useToggleMessageStar(conversationId)
  const toggleReaction = useToggleMessageReaction(conversationId)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachPanelHeight, setAttachPanelHeight] = useState(ATTACH_TRAY_HEIGHT)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const typingPeers = useTypingIndicator(conversationId)
  useTypingEmitter(conversationId, draft)

  // Restore any saved draft when entering the conversation.
  useEffect(() => {
    draftLoadedRef.current = false
    let cancelled = false
    void loadDraft(conversationId).then((saved) => {
      if (cancelled) return
      if (saved) setDraft(saved)
      draftLoadedRef.current = true
    })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Persist the draft (debounced) so typed text survives navigation.
  useEffect(() => {
    if (!draftLoadedRef.current) return
    const t = setTimeout(() => void saveDraft(conversationId, draft), 400)
    return () => clearTimeout(t)
  }, [conversationId, draft])
  const { data: searchHits } = useMessageSearch(conversationId, searchTerm)
  const [assignOpen, setAssignOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [attribOpen, setAttribOpen] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [videoTrimSource, setVideoTrimSource] = useState<VideoTrimSource | null>(null)
  const [videoTrimRestore, setVideoTrimRestore] = useState<VideoTrimSource | null>(null)
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)
  const [recordingOpen, setRecordingOpen] = useState(false)
  // Locked = the user slid up (or tapped) so recording continues hands-free and
  // is sent via the bar's send button instead of on finger release.
  const [recordingLocked, setRecordingLocked] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAt = useRef<number>(0)
  const voiceRecorder = useRef<VoiceRecording | null>(null)
  const [voiceRecorderLive, setVoiceRecorderLive] = useState<VoiceRecording | null>(null)
  const voiceStartInFlight = useRef(false)
  const messagesListRef = useRef<FlatList<ChatListItem>>(null)
  const scrollOffsetRef = useRef(0)
  const scrollRestoredRef = useRef(false)
  const [stickyDateLabel, setStickyDateLabel] = useState('')
  const [showScrollFab, setShowScrollFab] = useState(false)
  const canLoadOlderRef = useRef(true)
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

  const setVoiceNoteRuns = useGlobalAudioStore((s) => s.setVoiceNoteRuns)

  // Voice-note auto-advance: only consecutive voice notes (no text/media between).
  useEffect(() => {
    if (!isFocused) return
    setVoiceNoteRuns(buildVoiceNoteRuns(messagesData?.messages ?? []))
    return () => setVoiceNoteRuns([])
  }, [isFocused, messagesData?.messages, setVoiceNoteRuns])

  useEffect(() => {
    if (isFocused) return
    useGlobalAudioStore.getState().pause()
  }, [isFocused])

  const markReadAsync = markRead.mutateAsync
  const markedReadForFocusRef = useRef<string | null>(null)

  useEffect(() => {
    if (!conversationId || !isFocused) {
      markedReadForFocusRef.current = null
      return
    }
    if (markedReadForFocusRef.current === conversationId) return
    markedReadForFocusRef.current = conversationId
    const task = InteractionManager.runAfterInteractions(() => {
      void warmWaFeedbackSounds()
      void warmVoiceRecorder()
      void import('@/lib/postMediaMessage')
      void markReadAsync(conversationId).catch(() => undefined)
    })
    return () => task.cancel()
  }, [conversationId, isFocused, markReadAsync])

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
    setRecordingLocked(false)
    setRecordingMs(0)
    setVoiceRecorderLive(null)
    recordingStartedAt.current = 0
  }

  function startRecordingTimer() {
    if (recordingTimer.current) return
    setRecordingMs(0)
    recordingStartedAt.current = Date.now()
    recordingTimer.current = setInterval(() => {
      setRecordingMs(Date.now() - recordingStartedAt.current)
    }, 250)
  }

  function dismissChatSearch() {
    setSearchOpen(false)
    setSearchTerm('')
    Keyboard.dismiss()
  }

  async function waitForVoiceRecorder(maxMs = 3500): Promise<VoiceRecording | null> {
    const deadline = Date.now() + maxMs
    while (Date.now() < deadline) {
      if (voiceRecorder.current) return voiceRecorder.current
      await new Promise((r) => setTimeout(r, 50))
    }
    return voiceRecorder.current
  }

  async function ensureVoiceRecorder(): Promise<VoiceRecording | null> {
    if (voiceRecorder.current) return voiceRecorder.current
    if (voiceStartInFlight.current) return waitForVoiceRecorder()

    voiceStartInFlight.current = true
    try {
      const rec = await startVoiceRecording()
      voiceRecorder.current = rec
      setVoiceRecorderLive(rec)
      playWaFeedback('recordStart')
      return rec
    } catch (err) {
      clearRecordingUi()
      voiceRecorder.current = null
      toast.show(err instanceof Error ? err.message : 'Could not start recording', 'error')
      return null
    } finally {
      voiceStartInFlight.current = false
    }
  }

  const chatListItemsRef = useRef<ChatListItem[]>([])
  const chatListItems = useMemo((): ChatListItem[] => {
    const list =
      searchTerm.trim().length >= 2
        ? (searchHits ?? [])
        : (messagesData?.messages ?? [])
    const built =
      searchTerm.trim().length >= 2
        ? [...list].reverse().map((message) => ({
            kind: 'message' as const,
            id: message.id,
            message,
          }))
        : buildChatListItems(list)
    const stabilized = stabilizeChatListItems(chatListItemsRef.current, built)
    chatListItemsRef.current = stabilized
    return stabilized
  }, [messagesData?.messages, searchHits, searchTerm])

  const stickyDateRef = useRef('')

  useEffect(() => {
    stickyDateRef.current = ''
    setStickyDateLabel('')
  }, [conversationId])

  useEffect(() => {
    void ensureMediaIndexLoaded()
  }, [conversationId])

  useEffect(() => {
    scrollRestoredRef.current = false
    return () => {
      chatStateCache.save(conversationId, {
        scrollOffset: scrollOffsetRef.current,
        messageLimit: threadLimit,
      })
    }
  }, [conversationId, threadLimit])

  useEffect(() => {
    if (scrollRestoredRef.current || messagesPending) return
    const saved = chatStateCache.restore(conversationId)
    if (!saved?.scrollOffset) return
    scrollRestoredRef.current = true
    const offset = saved.scrollOffset
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToOffset({ offset, animated: false })
    })
  }, [conversationId, messagesPending, chatListItems.length])

  const onStickyDateChange = useCallback((label: string) => {
    if (label === stickyDateRef.current) return
    stickyDateRef.current = label
    setStickyDateLabel(label)
  }, [])

  const showScrollFabRef = useRef(false)

  const onMessagesScroll = useCallback((offsetY: number) => {
    scrollOffsetRef.current = offsetY
    const show = showScrollFabRef.current
    if (!show && offsetY > 96) {
      showScrollFabRef.current = true
      setShowScrollFab(true)
      return
    }
    if (show && offsetY < 20) {
      showScrollFabRef.current = false
      setShowScrollFab(false)
    }
  }, [])

  const scrollToLatest = useCallback(() => {
    showScrollFabRef.current = false
    setShowScrollFab(false)
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToOffset({ offset: 0, animated: true })
    })
  }, [])

  const scrollToQuotedMessage = useCallback(
    (messageId: string) => {
      const ok = scrollToChatMessage(
        messagesListRef,
        chatListItemsRef.current,
        messageId,
        setHighlightMessageId,
      )
      if (!ok) toast.show('Original message is not in this chat', 'error')
    },
    [toast],
  )

  const onDeepLinkNotFound = useCallback(() => {
    toast.show('Message not loaded in this chat', 'error')
  }, [toast])

  useDeepLinkScrollToMessage({
    messageId: deepLinkMessageId,
    messagesReady: !!messagesData && !messagesPending,
    messageCount: messagesData?.messages?.length ?? 0,
    chatListItemsRef,
    listRef: messagesListRef,
    hasOlderMessages: !!hasOlderMessages,
    fetchOlderMessages,
    setHighlightMessageId,
    onNotFound: onDeepLinkNotFound,
  })

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
    void clearDraft(conversationId)
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
    closeAttachMenu()
    setPendingLocation({ loading: true })
  }

  function cancelPendingLocation() {
    setPendingLocation(null)
  }

  function confirmPendingLocation(loc: MessageLocation & { name?: string }) {
    closeAttachMenu()
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
    closeAttachMenu()
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
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
            mediaTypes: ['images', 'videos'],
          })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`
      const mimeType = normalizeUploadMime(asset.mimeType ?? 'image/jpeg', name)
      const prepared = await prepareMediaFileForUpload(asset.uri, name, mimeType)
      const type = messageTypeFromMime(prepared.mimeType)
      if (type === 'video') {
        const info = await getVideoSourceInfo(prepared.uri)
        if (videoNeedsTrim(info)) {
          setVideoTrimSource({
            uri: prepared.uri,
            name: prepared.name,
            mimeType: prepared.mimeType,
            durationMs: info.durationMs || 60_000,
            sizeBytes: info.sizeBytes,
          })
          return
        }
      }
      setPendingMedia({
        uri: prepared.uri,
        name: prepared.name,
        mimeType: prepared.mimeType,
        type,
      })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not open picker', 'error')
    }
  }

  async function pickDocument() {
    closeAttachMenu()
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
    opts?: { skipPrepare?: boolean; clientMessageId?: string },
  ) {
    closeAttachMenu()
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
        skipPrepare: opts?.skipPrepare,
        clientMessageId: opts?.clientMessageId,
      })
      setPendingMedia(null)
      scrollToLatest()
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
      if (savedReply) setReplyTo(savedReply)
      throw err
    }
  }

  const onRetryMessage = useCallback((m: Message) => {
    const stalePending = isStalePendingMessage(m.status, m.sentAt, m.type, m.sendPhase)
    if (m.status === 'pending' && !stalePending) return
    if (m.status !== 'failed' && !stalePending) return
    if (m.id.startsWith('pending-text-')) return
    if (m.sendPhase === 'queued') return

    const onError = (err: unknown) => {
      toast.show(mediaSendErrorMessage(err), 'error')
    }

    const clientSend = readClientSendMeta(m)

    // Server already has media on S3 — re-queue WhatsApp delivery only.
    if (m.mediaUrl) {
      resendMessage.mutate(m.id, { onError })
      return
    }

    if (m.localPreviewUri || clientSend?.sourceUri) {
      const name = m.mediaFilename ?? `resend-${Date.now()}`
      const preparedUri = clientSend?.preparedUri
      const sourceUri = preparedUri ?? m.localPreviewUri ?? clientSend?.sourceUri!
      sendMedia.mutate(
        {
          uri: resolveUploadUri(sourceUri),
          name,
          mimeType: normalizeUploadMime(
            m.mediaMimeType ?? 'application/octet-stream',
            name,
          ),
          caption: m.body ?? undefined,
          replaceMessageId: m.id,
          videoTrim: preparedUri ? undefined : clientSend?.videoTrim,
          sendAsDocument: clientSend?.sendAsDocument,
          imageQuality: clientSend?.imageQuality,
          videoQuality: clientSend?.videoQuality,
          skipPrepare: !!preparedUri,
          preparedUri,
        },
        { onError },
      )
      return
    }

    resendMessage.mutate(m.id, { onError })
  }, [resendMessage, sendMedia, toast])

  const onMessageLongPress = useCallback((m: Message, anchor: MessageAnchor) => {
    setActionMessage(m)
    setActionAnchor(anchor)
    setActionsOpen(true)
  }, [])

  const onMessageForward = useCallback((m: Message) => {
    setForwardMessage(m)
  }, [])

  const dismissChatSearchStable = useCallback(() => {
    dismissChatSearch()
  }, [])

  const onFetchOlderMessages = useCallback(() => {
    void fetchOlderMessages()
  }, [fetchOlderMessages])

  function confirmVideoTrim(range: { startMs: number; endMs: number }) {
    if (!videoTrimSource) return
    const src = videoTrimSource
    setVideoTrimRestore({ ...src, initialRange: range })
    setVideoTrimSource(null)
    setPendingMedia({
      uri: src.uri,
      name: src.name,
      mimeType: src.mimeType,
      type: 'video',
      videoTrim: range,
      fromTrim: true,
    })
  }

  function sendTrimmedVideoAsDocument(range: { startMs: number; endMs: number }) {
    if (!videoTrimSource) return
    const src = videoTrimSource
    setVideoTrimRestore(null)
    setVideoTrimSource(null)
    closeAttachMenu()
    const clientMessageId = newPendingId('media')
    sendMedia.mutate(
      {
        uri: resolveUploadUri(src.uri),
        name: src.name,
        mimeType: normalizeUploadMime(src.mimeType, src.name),
        videoTrim: range,
        sendAsDocument: true,
        clientMessageId,
      },
      {
        onSuccess: () => scrollToLatest(),
        onError: (err) => {
          if (err instanceof Error && err.message === 'QUEUED_OFFLINE') return
          toast.show(mediaSendErrorMessage(err), 'error')
        },
      },
    )
  }

  function backToVideoTrim() {
    if (!videoTrimRestore) return
    setPendingMedia(null)
    setVideoTrimSource(videoTrimRestore)
  }

  function confirmPendingMedia(opts?: {
    caption?: string
    imageQuality?: 'standard' | 'hd'
    videoQuality?: 'standard' | 'hd'
    sendAsDocument?: boolean
  }) {
    if (!pendingMedia) return
    closeAttachMenu()
    const { uri, name, mimeType, videoTrim, type: mediaType } = pendingMedia
    const normalized = normalizeUploadMime(mimeType, name)
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    setPendingMedia(null)
    if (replyToMessageId) setReplyTo(null)
    scrollToLatest()
    const clientMessageId = newPendingId('media')
    const sendAsDocument = opts?.sendAsDocument ?? mediaType === 'document'
    sendMedia.mutate(
      {
        uri: resolveUploadUri(uri),
        name,
        mimeType: normalized,
        caption: opts?.caption,
        imageQuality: opts?.imageQuality,
        videoQuality: opts?.videoQuality,
        videoTrim,
        sendAsDocument,
        clientMessageId,
        replyToMessageId,
        replyToPreview,
      },
      {
        onSuccess: () => scrollToLatest(),
        onError: (err) => {
          if (err instanceof Error && err.message === 'QUEUED_OFFLINE') return
          toast.show(mediaSendErrorMessage(err), 'error')
          if (savedReply) setReplyTo(savedReply)
        },
      },
    )
  }

  function startRecording() {
    if (recordingOpen) return
    void ensureVoiceRecorder()
    startRecordingTimer()
    setRecordingOpen(true)
  }

  function cancelRecording() {
    hapticWarning()
    playWaFeedback('recordCancel')
    const rec = voiceRecorder.current
    voiceRecorder.current = null
    clearRecordingUi()
    if (rec) void cancelVoiceRecording(rec)
  }

  async function finishVoiceRecording() {
    let rec = voiceRecorder.current
    if (!rec && recordingOpen) {
      rec = await waitForVoiceRecorder(3500)
    }
    if (!rec) {
      if (recordingOpen) {
        toast.show('Microphone is still starting…', 'error')
        clearRecordingUi()
      }
      return
    }
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current)
      recordingTimer.current = null
    }
    const elapsedMs = recordingStartedAt.current
      ? Date.now() - recordingStartedAt.current
      : recordingMs

    if (elapsedMs < 400) {
      voiceRecorder.current = null
      clearRecordingUi()
      await cancelVoiceRecording(rec)
      toast.show('Recording too short', 'error')
      return
    }

    const clientMessageId = newPendingId('media')
    const savedReply = replyTo
    const replyToMessageId = savedReply?.id
    const replyToPreview = savedReply ? messageToReplyPreview(savedReply) : undefined
    if (replyToMessageId) setReplyTo(null)

    const optimistic = {
      ...buildOptimisticMediaMessage(conversationId, clientMessageId, {
        uri: '',
        name: `voice-${Date.now()}.ogg`,
        mimeType: 'audio/ogg',
        replyToMessageId,
        replyToPreview,
      }),
      sendPhase: 'preparing' as const,
    }
    voiceRecorder.current = null
    clearRecordingUi()
    playWaFeedback('send')
    await putOptimisticOutboundMessage(optimistic)
    scrollToLatest()

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    try {
      const { uri, durationMs, filename, mimeType } = await stopVoiceRecording(rec, elapsedMs)
      if (durationMs < 400) {
        await deleteMessages([clientMessageId])
        toast.show('Recording too short', 'error')
        return
      }

      await patchLocalMessage(clientMessageId, { localPreviewUri: uri })
      void cacheMediaFromLocalFile(
        clientMessageId,
        conversationId,
        uri,
        mimeType,
        filename,
      )

      sendMedia.mutate(
        {
          uri: resolveUploadUri(uri),
          name: filename,
          mimeType,
          skipPrepare: true,
          clientMessageId,
          replyToMessageId,
          replyToPreview,
        },
        {
          onSuccess: () => scrollToLatest(),
          onError: (err) => {
            if (err instanceof Error && err.message === 'QUEUED_OFFLINE') return
            toast.show(mediaSendErrorMessage(err), 'error')
            if (savedReply) setReplyTo(savedReply)
          },
        },
      )
    } catch (err) {
      await patchLocalMessage(clientMessageId, {
        status: 'failed',
        sendPhase: undefined,
        errorMessage: apiErrorMessage(err),
      })
      toast.show(apiErrorMessage(err), 'error')
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
    <View className="flex-1 bg-wa-bg dark:bg-wa-chatDark">
      <StatusBar style="light" />
      {/* Header */}
      <SafeAreaView edges={['top']} className="bg-wa-teal dark:bg-wa-headerDark">
        <View className="flex-row items-center gap-1 px-2 py-2.5">
          <Pressable
            onPress={() => {
              if (searchOpen) dismissChatSearch()
              else router.back()
            }}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </Pressable>
          <Avatar
            name={conversation?.contact?.name}
            fallback={conversation?.contact?.waId ?? contactName}
            size={38}
          />
          <View className="min-w-0 flex-1 justify-center pl-1.5">
            <Text numberOfLines={1} className="text-[17px] font-semibold text-white">
              {contactName}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs text-white/70">
              {conversation?.status ?? '—'}
            </Text>
          </View>
          {conversation ? <MessagingWindowTimer conversation={conversation} variant="header" /> : null}
          <Pressable
            onPress={() => setSearchOpen((v) => !v)}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="search" size={21} color="#ffffff" />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-white/15"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#ffffff" />
          </Pressable>
        </View>
      </SafeAreaView>

      {searchOpen ? (
        <View className="border-b border-neutral-200 bg-white px-3 py-2 dark:border-white/5 dark:bg-wa-headerDark">
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search"
            placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
            className="rounded-lg bg-neutral-100 px-3 py-2 text-[15px] text-neutral-900 dark:bg-wa-elevated dark:text-wa-textDark"
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}

      {typingPeers.length > 0 ? (
        <View className="bg-white/90 px-4 py-1 dark:bg-wa-panelDeep/90">
          <Text className="text-xs text-neutral-500 dark:text-wa-subDark">
            {typingPeers.join(', ')} {typingPeers.length === 1 ? 'is' : 'are'} typing…
          </Text>
        </View>
      ) : null}

      {(() => {
        const windowState = conversation ? messagingWindowState(conversation) : null
        if (!windowState || !showUnderHeaderBar(windowState)) return null
        return <MessagingWindowTimer conversation={conversation} variant="banner" />
      })()}

      <SocketConnectionBanner />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View className="min-h-0 flex-1">
          {messagesError ? (
            <QueryError
              message={userFacingLoadError(messagesFetchError, 'chat')}
              onRetry={() => void refetchMessages()}
            />
          ) : showMessagesLoader ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#00A884" />
            </View>
          ) : (
            <View className="min-h-0 flex-1">
            <ChatStickyDateBar
              label={stickyDateLabel}
              visible={!searchOpen && stickyDateLabel.length > 0}
            />
            <ChatMessagesList
              listRef={messagesListRef}
              data={chatListItems}
              highlightMessageId={highlightMessageId}
              contactName={contactName}
              contactAvatarUrl={conversation?.contact?.profilePictureUrl}
              searchOpen={searchOpen}
              isFetchingOlder={isFetchingOlder}
              hasOlderMessages={!!hasOlderMessages}
              canLoadOlderRef={canLoadOlderRef}
              onFetchOlder={onFetchOlderMessages}
              onDismissSearch={dismissChatSearchStable}
              onStickyDateChange={onStickyDateChange}
              onScrollOffset={onMessagesScroll}
              onReply={onReplyToMessage}
              onReplyQuotePress={scrollToQuotedMessage}
              onSwipeOpen={onMessageSwipeOpen}
              onRetry={onRetryMessage}
              onLongPress={onMessageLongPress}
              onForward={onMessageForward}
            />
            <ScrollToLatestButton
              visible={showScrollFab && !recordingOpen}
              onPress={scrollToLatest}
              bottomInset={12}
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
            backgroundColor: isDark ? '#111B21' : '#ffffff',
            paddingBottom: hideFooterSafePad ? 0 : safeBottom,
          }}
        >
          {canSendSession ? (
            <View
              className={`bg-white dark:bg-wa-panelDeep ${attachMenuOpen || recordingOpen ? '' : 'border-t border-neutral-100 dark:border-white/5'}`}
            >
              {replyTo && !recordingOpen ? (
                <View className="flex-row items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-white/5">
                  <View className="flex-1">
                    <ReplyQuoteBlock
                      reply={messageToReplyPreview(replyTo)}
                      contactName={contactName}
                      isOutboundBubble={false}
                    />
                  </View>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={8} className="p-1">
                    <Ionicons name="close" size={20} color={isDark ? '#8696A0' : '#9ca3af'} />
                  </Pressable>
                </View>
              ) : null}
              <View className="flex-row items-center gap-2 px-3 py-2.5">
                {/* LEFT: discard while recording, attach/keyboard otherwise. */}
                {recordingOpen ? (
                  <PressableScale
                    onPress={cancelRecording}
                    haptic="none"
                    hitSlop={8}
                    className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-wa-elevated"
                  >
                    <Ionicons name="trash-outline" size={20} color={isDark ? '#f87171' : '#ef4444'} />
                  </PressableScale>
                ) : (
                  <Pressable
                    onPress={onComposerSidePress}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={showKeyboardIcon ? 'Show keyboard' : 'Attach file'}
                    className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-transparent"
                  >
                    {showKeyboardIcon ? (
                      <KeyboardIcon color={isDark ? '#aebac1' : '#54656f'} />
                    ) : (
                      <Ionicons name="attach" size={24} color={isDark ? '#aebac1' : '#54656f'} />
                    )}
                  </Pressable>
                )}

                {/* MIDDLE: live waveform while recording, text input otherwise. */}
                {recordingOpen ? (
                  <View className="h-11 flex-1 flex-row items-center gap-2 rounded-2xl bg-neutral-100 px-3 dark:bg-wa-elevated">
                    <RecordingPulse />
                    <VoiceRecordingWaveform recorder={voiceRecorderLive} active={recordingOpen} />
                    <Text className="shrink-0 text-sm font-medium tabular-nums text-neutral-700 dark:text-neutral-300">
                      {formatDuration(recordingMs / 1000)}
                    </Text>
                    {!recordingLocked ? (
                      <Text className="shrink-0 text-[11px] text-neutral-400 dark:text-wa-subDark">
                        ‹ slide to cancel
                      </Text>
                    ) : null}
                  </View>
                ) : (
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
                      textAlignVertical="center"
                      className="max-h-28 min-h-[44px] flex-1 rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-[15px] leading-5 text-neutral-900 dark:border-transparent dark:bg-wa-elevated dark:text-wa-textDark"
                      placeholderTextColor={isDark ? '#8696A0' : '#9ca3af'}
                    />
                  </Pressable>
                )}

                {/* RIGHT: text send, locked-voice send, or the hold-to-record mic.
                    The mic stays mounted through start so its pan gesture is never
                    interrupted by a layout swap. */}
                {!recordingOpen && draft.trim() ? (
                  <PressableScale
                    onPress={onSendText}
                    haptic="light"
                    disabled={sendText.isPending}
                    className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-teal shadow-sm"
                  >
                    <Ionicons name="send" size={19} color="#ffffff" style={{ marginLeft: 2 }} />
                  </PressableScale>
                ) : recordingOpen && recordingLocked ? (
                  <PressableScale
                    onPress={() => {
                      hapticLight()
                      void finishVoiceRecording()
                    }}
                    haptic="none"
                    disabled={sendMedia.isPending}
                    className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-teal shadow-sm"
                  >
                    {sendMedia.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="send" size={19} color="#ffffff" style={{ marginLeft: 2 }} />
                    )}
                  </PressableScale>
                ) : (
                  <VoiceRecordButton
                    disabled={sendMedia.isPending}
                    recording={recordingOpen}
                    onStart={startRecording}
                    onSend={() => void finishVoiceRecording()}
                    onCancel={cancelRecording}
                    onLock={() => setRecordingLocked(true)}
                  />
                )}
              </View>
            </View>
        ) : needsTemplate ? (
          <View className="bg-white px-4 py-3 dark:bg-wa-panelDeep">
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
        onCopy={(m) => {
          if (!m.body) return
          void Clipboard.setStringAsync(m.body)
          toast.show('Copied to clipboard')
        }}
        onStar={(m) => {
          void toggleStar.mutateAsync({ messageId: m.id, starred: !m.starredAt })
        }}
        onReact={(m, emoji) => {
          void toggleReaction.mutateAsync({ messageId: m.id, emoji })
        }}
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
        status={conversation?.status}
        onResolve={() => {
          setMenuOpen(false)
          void resolveConversation()
        }}
        onReopen={async () => {
          setMenuOpen(false)
          try {
            await update.mutateAsync({ status: 'open' })
            toast.show('Conversation reopened', 'success')
          } catch (err) {
            toast.show(apiErrorMessage(err), 'error')
          }
        }}
        onAssign={() => {
          setMenuOpen(false)
          setAssignOpen(true)
        }}
        onAttribution={() => {
          setMenuOpen(false)
          setAttribOpen(true)
        }}
        onMediaGallery={() => {
          setMenuOpen(false)
          router.push(`/conversation/${conversationId}/media`)
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
        onCancel={() => {
          setPendingMedia(null)
          setVideoTrimRestore(null)
        }}
        onBackToTrim={pendingMedia?.fromTrim ? backToVideoTrim : undefined}
        onSend={(opts) => confirmPendingMedia(opts)}
      />

      <VideoTrimSheet
        source={videoTrimSource}
        onCancel={() => setVideoTrimSource(null)}
        onConfirm={(range) => void confirmVideoTrim(range)}
        onSendAsDocument={(range) => void sendTrimmedVideoAsDocument(range)}
      />

      <LocationPickerSheet
        open={pendingLocation != null}
        sending={sendLocation.isPending}
        onCancel={cancelPendingLocation}
        onSend={confirmPendingLocation}
        onPermissionDenied={() => toast.show('Location permission denied', 'error')}
      />
    </View>
  )
}
