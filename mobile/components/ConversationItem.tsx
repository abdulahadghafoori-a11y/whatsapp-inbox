import { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { formatTime } from '@/lib/format'
import { StatusTicks } from '@/components/StatusTicks'
import type { ConversationListItem, MessageStatus, MessageType } from '@/types'

function initials(name: string | null, fallback: string) {
  const base = name?.trim() || fallback
  return base.slice(0, 2).toUpperCase()
}

function ConversationItemBase({
  conversation,
  onPress,
  onLongPress,
  selected,
}: {
  conversation: ConversationListItem
  onPress: (id: string) => void
  onLongPress?: (id: string) => void
  selected?: boolean
}) {
  const { contact } = conversation
  const name = contact.name || contact.waId
  const isPinned = !!conversation.pinnedAt
  const showTicks =
    conversation.lastMessageDirection === 'outbound' &&
    conversation.lastMessageStatus != null

  return (
    <Pressable
      onPress={() => onPress(conversation.id)}
      onLongPress={onLongPress ? () => onLongPress(conversation.id) : undefined}
      delayLongPress={280}
      className={`flex-row items-center gap-3 border-b border-neutral-100 px-3 py-3 active:bg-neutral-50 ${
        selected ? 'bg-wa-teal/10' : 'bg-white'
      }`}
    >
      <View className="relative">
        <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-wa-teal">
          <Text className="text-[17px] font-semibold text-white">
            {initials(contact.name, contact.waId)}
          </Text>
        </View>
        {isPinned ? (
          <View className="absolute -left-0.5 -top-0.5 rounded-full bg-amber-500 px-1 py-0.5">
            <Text className="text-[9px]">📌</Text>
          </View>
        ) : null}
        {selected ? (
          <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-wa-teal">
            <Text className="text-[11px] font-bold text-white">✓</Text>
          </View>
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 text-[17px] font-semibold text-neutral-900">
            {name}
          </Text>
          <Text className="shrink-0 text-[13px] font-medium tabular-nums text-neutral-500">
            {formatTime(conversation.lastMessageAt)}
          </Text>
        </View>

        <View className="mt-1 flex-row items-center gap-1">
          {showTicks ? (
            <View className="shrink-0 pb-0.5">
              <StatusTicks
                status={conversation.lastMessageStatus as MessageStatus}
                messageType={conversation.lastMessageType as MessageType | undefined}
              />
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            className={`min-w-0 flex-1 text-[15px] leading-5 ${
              conversation.unreadCount > 0
                ? 'font-medium text-neutral-800'
                : 'text-neutral-500'
            }`}
          >
            {conversation.lastMessagePreview ?? 'No messages yet'}
          </Text>
          <View className="ml-1 shrink-0 flex-row items-center gap-1.5">
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
              <View className="h-[22px] min-w-[22px] items-center justify-center rounded-full bg-wa-green px-1.5">
                <Text className="text-[12px] font-bold text-white">
                  {conversation.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {conversation.assignedAgent?.name ? (
          <Text className="mt-0.5 text-[13px] text-neutral-400">
            Assigned: {conversation.assignedAgent.name}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export const ConversationItem = memo(ConversationItemBase)
