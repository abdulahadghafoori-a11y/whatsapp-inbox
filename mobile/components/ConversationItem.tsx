import { memo, type ComponentProps } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { formatTime } from '@/lib/format'
import { INBOX_ROW_HEIGHT } from '@/lib/inboxList'
import { StatusTicks } from '@/components/StatusTicks'
import { Avatar } from '@/components/Avatar'
import type { ConversationListItem, MessageStatus, MessageType } from '@/types'

const inboxRowStyle = StyleSheet.create({
  row: {
    height: INBOX_ROW_HEIGHT,
    overflow: 'hidden',
  },
})

function ConversationItemBase({
  conversation,
  onPress,
  onLongPress,
  selected,
  variant = 'default',
}: {
  conversation: ConversationListItem
  onPress: (id: string) => void
  onLongPress?: (id: string) => void
  selected?: boolean
  variant?: 'default' | 'inbox'
}) {
  const isInbox = variant === 'inbox'
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
      style={isInbox ? inboxRowStyle.row : undefined}
      className={`flex-row items-center gap-3 border-b border-neutral-100 px-3 py-3 active:bg-neutral-50 dark:border-white/5 dark:active:bg-wa-panel ${
        selected ? 'bg-wa-teal/10 dark:bg-wa-teal/20' : 'bg-white dark:bg-wa-panelDeep'
      }`}
    >
      <View className="relative">
        <Avatar name={contact.name} fallback={contact.waId} size={52} />
        {isPinned ? (
          <View className="absolute -left-0.5 -top-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-amber-500 dark:border-wa-panelDeep">
            <Ionicons name="pin" size={10} color="#ffffff" />
          </View>
        ) : null}
        {selected ? (
          <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-wa-teal dark:border-wa-panelDeep">
            <Ionicons name="checkmark" size={12} color="#ffffff" />
          </View>
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 text-[16.5px] font-semibold text-neutral-900 dark:text-wa-textDark">
            {name}
          </Text>
          <Text
            className={`shrink-0 text-[12.5px] tabular-nums ${
              conversation.unreadCount > 0
                ? 'font-semibold text-wa-teal dark:text-wa-green'
                : 'font-medium text-neutral-500 dark:text-wa-subDark'
            }`}
          >
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
                ? 'font-medium text-neutral-800 dark:text-neutral-200'
                : 'text-neutral-500 dark:text-wa-subDark'
            }`}
          >
            {conversation.lastMessagePreview ?? 'No messages yet'}
          </Text>
          <View className="ml-1 shrink-0 flex-row items-center gap-1.5">
            {conversation.isCtwaLead && (
              <View className="rounded-md bg-sky-100 px-1.5 py-0.5 dark:bg-sky-500/20">
                <Text className="text-[10px] font-semibold tracking-wide text-sky-700 dark:text-sky-300">CTWA</Text>
              </View>
            )}
            {conversation.aiHandled && (
              <View className="rounded-md bg-purple-100 px-1.5 py-0.5 dark:bg-purple-500/20">
                <Text className="text-[10px] font-semibold tracking-wide text-purple-700 dark:text-purple-300">AI</Text>
              </View>
            )}
            {conversation.unreadCount > 0 && (
              <View className="h-[21px] min-w-[21px] items-center justify-center rounded-full bg-wa-green px-1.5 shadow-sm">
                <Text className="text-[11.5px] font-bold text-white">
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!isInbox && conversation.assignedAgent?.name ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-[13px] text-neutral-400 dark:text-wa-subDark"
          >
            Assigned: {conversation.assignedAgent.name}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function conversationItemEqual(
  prev: ComponentProps<typeof ConversationItemBase>,
  next: ComponentProps<typeof ConversationItemBase>,
) {
  return (
    prev.conversation === next.conversation &&
    prev.selected === next.selected &&
    prev.variant === next.variant &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress
  )
}

export const ConversationItem = memo(ConversationItemBase, conversationItemEqual)
