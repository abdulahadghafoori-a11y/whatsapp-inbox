import { Modal, View, Text, Pressable } from 'react-native'
import type { Message } from '@/types'

const EDIT_WINDOW_MS = 15 * 60 * 1000

export function MessageActionsSheet({
  message,
  visible,
  onClose,
  onReply,
  onEdit,
  onDelete,
}: {
  message: Message | null
  visible: boolean
  onClose: () => void
  onReply: (m: Message) => void
  onEdit: (m: Message) => void
  onDelete: (m: Message) => void
}) {
  if (!message) return null

  const outbound = message.direction === 'outbound'
  const deleted = !!message.deletedAt
  const canEdit =
    outbound &&
    message.type === 'text' &&
    !deleted &&
    Date.now() - new Date(message.sentAt).getTime() < EDIT_WINDOW_MS
  const canDelete = outbound && !deleted && !!message.waMessageId

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={(e) => e.stopPropagation()} className="rounded-t-2xl bg-white px-4 pb-8 pt-3">
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-neutral-200" />
          <Pressable
            onPress={() => {
              onReply(message)
              onClose()
            }}
            className="border-b border-neutral-100 py-4"
          >
            <Text className="text-center text-base text-neutral-900">Reply</Text>
          </Pressable>
          {canEdit ? (
            <Pressable
              onPress={() => {
                onEdit(message)
                onClose()
              }}
              className="border-b border-neutral-100 py-4"
            >
              <Text className="text-center text-base text-neutral-900">Edit (inbox only)</Text>
              <Text className="mt-1 text-center text-xs text-neutral-500">
                Corrects text for your team; customer WhatsApp is unchanged
              </Text>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              onPress={() => {
                onDelete(message)
                onClose()
              }}
              className="py-4"
            >
              <Text className="text-center text-base font-semibold text-red-600">
                Delete for everyone
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} className="mt-2 rounded-xl bg-neutral-100 py-3">
            <Text className="text-center text-base text-neutral-700">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
