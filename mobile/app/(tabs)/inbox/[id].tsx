import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native'
import { runOnJS, runOnUI } from 'react-native-reanimated'
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { MessageBubble } from '@/components/MessageBubble'
import { MessageActionsSheet } from '@/components/MessageActionsSheet'
import { MessagingBanner } from '@/components/MessagingBanner'
import { AttachIcon, CloseIcon, KeyboardIcon, MicIcon, SendIcon } from '@/components/ChatIcons'
import { AttachPanel, ATTACH_TRAY_HEIGHT } from '@/components/AttachMenu'
import { MediaPreviewSheet, type PendingMedia } from '@/components/MediaPreviewSheet'
import { useToast } from '@/components/Toast'
import { messageTypeFromMime, normalizeUploadMime } from '@/lib/mediaMime'
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
  useEditMessage,
  useDeleteMessage,
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
import { resolveUploadUri } from '@/lib/uploadUri'
import {
  playWaFeedback,
  playWaFeedbackAsync,
  warmWaFeedbackSounds,
} from '@/lib/waFeedbackSounds'
import type { Message } from '@/types'

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const conversationId = id as string
  const router = useRouter()
  const navigation = useNavigation()
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const toast = useToast()

  const { data: conversation } = useConversation(conversationId)
  const { data: messagesData, isPending: messagesPending } = useMessages(conversationId)
  const sendText = useSendText(conversationId)
  const editMessage = useEditMessage(conversationId)
  const deleteMessage = useDeleteMessage(conversationId)
  const sendMedia = useSendMedia(conversationId)
  const resendMessage = useResendMessage(conversationId)
  const markRead = useMarkRead()
  const update = useUpdateConversation(conversationId)

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [actionMessage, setActionMessage] = useState<Message | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Message | null>(null)
  const [editDraft, setEditDraft] = useState('')
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
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAt = useRef<number>(0)
  const voiceRecorder = useRef<VoiceRecording | null>(null)
  const voiceStartInFlight = useRef(false)
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

  useFocusEffect(
    useCallback(() => {
      const tab = navigation.getParent()
      tab?.setOptions({ tabBarStyle: { display: 'none' } })
      return () => {
        tab?.setOptions({ tabBarStyle: undefined })
      }
    }, [navigation]),
  )

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

  /** + when idle/typing; keyboard icon only while the attach tray is open. */
  const showKeyboardIcon = attachMenuOpen

  function onComposerSidePress() {
    if (showKeyboardIcon) {
      focusComposer()
    } else {
      openAttachMenu()
    }
  }

  /** Wait for attach tray spring to settle before opening system pickers. */
  function runAttachAction(action: () => void | Promise<void>, delayMs = 380) {
    closeAttachMenu()
    setTimeout(() => {
      void action()
    }, delayMs)
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
    void warmWaFeedbackSounds()
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

  useEffect(() => {
    if (conversationId) void markRead.mutateAsync(conversationId).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Inverted list wants newest first; API returns oldest-first.
  const inverted = useMemo(
    () => (messagesData?.messages ?? []).slice().reverse(),
    [messagesData],
  )

  const canSendSession = conversation?.canSendSession ?? conversation?.isWindowOpen ?? false
  const needsTemplate = conversation?.needsTemplateForReply ?? !canSendSession
  const contactName = conversation?.contact?.name || conversation?.contact?.waId || 'Chat'

  async function onSendText() {
    const body = draft.trim()
    if (!body) return
    const replyToMessageId = replyTo?.id
    setDraft('')
    setReplyTo(null)
    try {
      const msg = await sendText.mutateAsync({ body, replyToMessageId })
      if (msg.id.startsWith('pending-text-')) {
        toast.show('Offline — message will send when you are back online')
      } else {
        void playWaFeedback('send')
      }
    } catch (err) {
      if (isNetworkError(err)) {
        toast.show('Offline — message queued')
      } else {
        toast.show(apiErrorMessage(err), 'error')
        setDraft(body)
        if (replyToMessageId && replyTo) setReplyTo(replyTo)
      }
    }
  }

  async function onConfirmEdit() {
    if (!editTarget) return
    const body = editDraft.trim()
    if (!body) return
    try {
      await editMessage.mutateAsync({ messageId: editTarget.id, body })
      setEditTarget(null)
      setEditDraft('')
      toast.show('Message updated in inbox')
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
  }

  async function onConfirmDelete(m: Message) {
    try {
      await deleteMessage.mutateAsync(m.id)
      toast.show('Message deleted')
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
    }
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
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            mediaTypes: ['images', 'videos'],
          })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`
      const mimeType = normalizeUploadMime(asset.mimeType ?? 'image/jpeg', name)
      setPendingMedia({
        uri: asset.uri,
        name,
        mimeType,
        type: messageTypeFromMime(mimeType),
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
      setPendingMedia({
        uri: resolveUploadUri(a.uri),
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
    try {
      await sendMedia.mutateAsync({
        uri: resolveUploadUri(uri),
        name,
        mimeType: normalized,
        caption,
      })
      setPendingMedia(null)
    } catch (err) {
      toast.show(apiErrorMessage(err), 'error')
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
    void uploadAsset(
      pendingMedia.uri,
      pendingMedia.name,
      pendingMedia.mimeType,
      caption,
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
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[17px] font-semibold text-white">
            {contactName}
          </Text>
          <Text numberOfLines={1} className="text-xs text-white/75">
            {conversation?.contact?.waId} · {conversation?.status ?? '—'}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
        >
          <Text className="text-lg text-white">⋮</Text>
        </Pressable>
      </View>

      <MessagingBanner conversation={conversation} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View className="min-h-0 flex-1">
          {showMessagesLoader ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#128C7E" />
            </View>
          ) : (
            <FlatList
              data={inverted}
              inverted
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: Message }) => (
                <MessageBubble
                  message={item}
                  onRetry={(m) => void onRetryMessage(m)}
                  onLongPress={(m) => {
                    setActionMessage(m)
                    setActionsOpen(true)
                  }}
                />
              )}
              contentContainerStyle={{ paddingVertical: 8 }}
            />
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
                <View className="h-11 flex-1 flex-row items-center gap-2 rounded-2xl bg-red-50 px-4">
                  <View className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <Text className="text-base font-semibold tabular-nums text-neutral-800">
                    {formatDuration(recordingMs / 1000)}
                  </Text>
                  <Text className="text-sm text-neutral-500">
                    {micReady ? 'Recording voice…' : 'Starting microphone…'}
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
                  <View className="flex-1 border-l-2 border-wa-teal pl-2">
                    <Text className="text-xs font-semibold text-wa-teal">Replying</Text>
                    <Text numberOfLines={2} className="text-sm text-neutral-600">
                      {replyTo.deletedAt
                        ? 'Message deleted'
                        : replyTo.body || `[${replyTo.type}]`}
                    </Text>
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
          />
        </View>
      </KeyboardAvoidingView>

      <MessageActionsSheet
        message={actionMessage}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onReply={(m) => setReplyTo(m)}
        onEdit={(m) => {
          setEditTarget(m)
          setEditDraft(m.body ?? '')
        }}
        onDelete={(m) => void onConfirmDelete(m)}
      />

      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        <RNKeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          <View className="rounded-t-2xl bg-white px-4 pb-8 pt-4">
            <Text className="mb-2 text-base font-semibold text-neutral-900">Edit message</Text>
            <TextInput
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              className="min-h-[100px] rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[15px] text-neutral-900"
            />
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => setEditTarget(null)}
                className="flex-1 rounded-xl bg-neutral-100 py-3"
              >
                <Text className="text-center font-medium text-neutral-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void onConfirmEdit()}
                disabled={editMessage.isPending}
                className="flex-1 rounded-xl bg-wa-teal py-3"
              >
                <Text className="text-center font-medium text-white">Save</Text>
              </Pressable>
            </View>
          </View>
        </RNKeyboardAvoidingView>
      </Modal>

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
        sending={sendMedia.isPending}
        onCancel={() => setPendingMedia(null)}
        onSend={(caption) => confirmPendingMedia(caption)}
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
