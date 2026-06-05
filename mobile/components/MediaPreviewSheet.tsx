import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer'
import { SwipeDismissContainer } from '@/components/SwipeDismissContainer'
import { ZoomableImageViewer } from '@/components/ZoomableImageViewer'
import { CloseIcon, DocumentIcon, MicIcon, SendIcon } from '@/components/ChatIcons'
import { formatDuration } from '@/lib/format'
import { PresentationModal } from '@/components/PresentationModal'
import { resolveUploadUri } from '@/lib/uploadUri'
import type { MessageType } from '@/types'

export type PendingMedia = {
  uri: string
  name: string
  mimeType: string
  type: MessageType
  durationMs?: number
}

export function MediaPreviewSheet({
  media,
  onCancel,
  onSend,
}: {
  media: PendingMedia | null
  onCancel: () => void
  onSend: (caption?: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [caption, setCaption] = useState('')

  useEffect(() => {
    setCaption('')
  }, [media?.uri])

  const showCaption =
    media?.type === 'image' || media?.type === 'video' || media?.type === 'document'

  const swipeDismissImage =
    media?.type === 'image' || media?.type === 'sticker'

  const isVideo = media?.type === 'video'
  const topPad = Math.max(insets.top, Platform.OS === 'android' ? 12 : 8)

  return (
    <PresentationModal visible={media != null} onClose={onCancel} animationType="slide">
      {media ? (
        <View
          style={[
            styles.root,
            { paddingTop: topPad, paddingBottom: insets.bottom },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
          >
            <View style={styles.header}>
              <Pressable
                onPress={onCancel}
                hitSlop={16}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close preview"
              >
                <CloseIcon size={26} color="#fff" />
              </Pressable>
              <Text style={styles.headerTitle}>Preview</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.mediaArea}>
              {swipeDismissImage ? (
                <SwipeDismissContainer onDismiss={onCancel} style={styles.flex}>
                  <ZoomableImageViewer
                    uri={resolveUploadUri(media.uri)}
                    fillContainer
                    backgroundColor="transparent"
                    enableDismissGesture
                    onRequestClose={onCancel}
                  />
                </SwipeDismissContainer>
              ) : null}

              {isVideo ? (
                <InteractiveVideoPlayer
                  url={resolveUploadUri(media.uri)}
                  fill
                  expanded
                  onSwipeDismiss={onCancel}
                />
              ) : null}

              {media.type === 'audio' ? (
                <View style={styles.centered}>
                  <View style={styles.audioCard}>
                    <MicIcon size={48} color="#fff" />
                    <Text style={styles.audioTitle}>Voice message</Text>
                    {media.durationMs != null && media.durationMs > 0 ? (
                      <Text style={styles.audioDuration}>
                        {formatDuration(media.durationMs / 1000)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {media.type === 'document' ? (
                <View style={styles.centered}>
                  <View style={styles.audioCard}>
                    <DocumentIcon size={48} color="#fff" />
                    <Text style={styles.docName} numberOfLines={2}>
                      {media.name}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {showCaption ? (
              <View style={styles.captionWrap}>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Add a caption (optional)"
                  placeholderTextColor="#9ca3af"
                  style={styles.captionInput}
                />
              </View>
            ) : null}

            <View style={styles.footer}>
              <Pressable onPress={onCancel} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onSend(caption.trim() || undefined)}
                style={styles.sendBtn}
              >
                <SendIcon />
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </PresentationModal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 30,
    elevation: 30,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerSpacer: {
    width: 44,
  },
  mediaArea: {
    flex: 1,
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioCard: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  audioTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  audioDuration: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    fontVariant: ['tabular-nums'],
  },
  docName: {
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  captionWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  captionInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  cancelBtn: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 120,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00A884',
    paddingHorizontal: 20,
  },
  sendText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})
