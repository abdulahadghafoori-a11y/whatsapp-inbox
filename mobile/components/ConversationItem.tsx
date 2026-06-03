import { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { formatTime, windowHoursLeft } from '@/lib/format'
import type { ConversationListItem } from '@/types'

function initials(name: string | null, fallback: string) {
  const base = name?.trim() || fallback
  return base.slice(0, 2).toUpperCase()
}

function ConversationItemBase({
  conversation,
  onPress,
}: {
  conversation: ConversationListItem
  onPress: (id: string) => void
}) {
  const { contact } = conversation
  const name = contact.name || contact.waId
  const hoursLeft = windowHoursLeft(conversation.windowExpiresAt)
  const windowWarning = hoursLeft > 0 && hoursLeft < 2
  return (
    <Pressable
      onPress={() => onPress(conversation.id)}
      className="flex-row items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 active:bg-neutral-50"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-wa-teal">
        <Text className="font-semibold text-white">{initials(contact.name, contact.waId)}</Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text numberOfLines={1} className="flex-1 text-base font-semibold text-neutral-900">
            {name}
          </Text>
          <Text className="ml-2 text-xs text-neutral-400">
            {formatTime(conversation.lastMessageAt)}
          </Text>
        </View>

        <View className="mt-0.5 flex-row items-center justify-between">
          <Text numberOfLines={1} className="flex-1 text-sm text-neutral-500">
            {conversation.lastMessagePreview ?? 'No messages yet'}
          </Text>
          <View className="ml-2 flex-row items-center gap-1.5">
            {windowWarning && <View className="h-2 w-2 rounded-full bg-orange-400" />}
            {conversation.isCtwaLead && (
              <View className="rounded bg-sky-100 px-1.5 py-0.5">
                <Text className="text-[10px] font-medium text-sky-800">CTWA</Text>
              </View>
            )}
            {conversation.aiHandled && (
              <View className="rounded bg-purple-100 px-1.5 py-0.5">
                <Text className="text-[10px] font-medium text-purple-700">AI</Text>
              </View>
            )}
            {conversation.unreadCount > 0 && (
              <View className="h-5 min-w-5 items-center justify-center rounded-full bg-wa-green px-1.5">
                <Text className="text-[11px] font-bold text-white">
                  {conversation.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {conversation.assignedAgent?.name && (
          <Text className="mt-0.5 text-xs text-neutral-400">
            Assigned: {conversation.assignedAgent.name}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

export const ConversationItem = memo(ConversationItemBase)
