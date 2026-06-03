import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { ChatVideo } from '@/components/ChatVideo'
import { CloseIcon, DocumentIcon, MicIcon, SendIcon } from '@/components/ChatIcons'
import { formatDuration } from '@/lib/format'
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
  sending,
  onCancel,
  onSend,
}: {
  media: PendingMedia | null
  sending: boolean
  onCancel: () => void
  onSend: (caption?: string) => void
}) {
  const [caption, setCaption] = useState('')

  useEffect(() => {
    setCaption('')
  }, [media?.uri])

  const showCaption =
    media?.type === 'image' || media?.type === 'video' || media?.type === 'document'

  return (
    <Modal
      visible={media != null}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      {media ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 bg-black/95"
        >
          <View className="flex-row items-center justify-between px-4 pb-2 pt-14">
            <Pressable
              onPress={onCancel}
              disabled={sending}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <CloseIcon size={28} color="#fff" />
            </Pressable>
            <Text className="text-base font-semibold text-white">Preview</Text>
            <View className="w-10" />
          </View>

          <View className="flex-1 items-center justify-center px-4">
            {media.type === 'image' || media.type === 'sticker' ? (
              <Image
                source={{ uri: media.uri }}
                style={{ width: '100%', height: '72%' }}
                contentFit="contain"
              />
            ) : null}

            {media.type === 'video' ? (
              <View className="h-[72%] w-full overflow-hidden rounded-xl">
                <ChatVideo url={media.uri} />
              </View>
            ) : null}

            {media.type === 'audio' ? (
              <View className="items-center gap-3 rounded-2xl bg-white/10 px-8 py-10">
                <MicIcon size={48} color="#fff" />
                <Text className="text-lg font-semibold text-white">Voice message</Text>
                {media.durationMs != null && media.durationMs > 0 ? (
                  <Text className="text-base tabular-nums text-white/80">
                    {formatDuration(media.durationMs / 1000)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {media.type === 'document' ? (
              <View className="items-center gap-4 rounded-2xl bg-white/10 px-8 py-10">
                <DocumentIcon size={48} color="#fff" />
                <Text className="max-w-[280px] text-center text-base font-medium text-white">
                  {media.name}
                </Text>
              </View>
            ) : null}
          </View>

          {showCaption ? (
            <View className="px-4 pb-2">
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption (optional)"
                placeholderTextColor="#9ca3af"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-[15px] text-white"
              />
            </View>
          ) : null}

          <View className="flex-row items-center justify-end gap-3 px-4 pb-10 pt-3">
            <Pressable
              onPress={onCancel}
              disabled={sending}
              className="rounded-full bg-white/15 px-5 py-3"
            >
              <Text className="font-medium text-white">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSend(caption.trim() || undefined)}
              disabled={sending}
              className="h-12 min-w-[120px] flex-row items-center justify-center gap-2 rounded-full bg-wa-teal px-5"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <SendIcon />
                  <Text className="font-semibold text-white">Send</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  )
}
