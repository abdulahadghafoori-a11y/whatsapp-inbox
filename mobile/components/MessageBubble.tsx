import { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { MediaMessage } from './MediaMessage'
import { StatusTicks } from './StatusTicks'
import { RetryIcon } from './ChatIcons'
import { formatTime } from '@/lib/format'
import type { Message } from '@/types'

function replySnippet(m: Message['replyTo']): string {
  if (!m) return ''
  if (m.deletedAt) return 'Message deleted'
  if (m.body) return m.body
  return `[${m.type}]`
}

function MessageBubbleBase({
  message,
  onRetry,
  onLongPress,
}: {
  message: Message
  onRetry?: (m: Message) => void
  onLongPress?: (m: Message) => void
}) {
  const outbound = message.direction === 'outbound'
  const isMedia = message.type !== 'text'
  const isAudio = message.type === 'audio'
  const deleted = !!message.deletedAt
  const failed = outbound && message.status === 'failed'
  const sending = outbound && message.status === 'pending'
  const stalePending =
    sending && Date.now() - new Date(message.sentAt).getTime() > 45_000
  const showRetry = (failed || stalePending) && !sending
  const isQueuedOffline = message.id.startsWith('pending-text-')
  const isUploadingMedia = message.id.startsWith('pending-media-')
  const tickStatus = isUploadingMedia ? 'pending' : message.status

  const bubbleClass = failed || stalePending
    ? 'rounded-2xl rounded-br-md border border-[#e8b4b4] bg-[#f5d5d5] shadow-sm'
    : sending
      ? 'rounded-2xl rounded-br-md bg-wa-light/90 shadow-sm opacity-95'
      : outbound
      ? 'rounded-2xl rounded-br-md bg-wa-light shadow-sm'
      : 'rounded-2xl rounded-bl-md border border-black/[0.04] bg-white shadow-sm'

  if (deleted) {
    return (
      <View className={`my-1 px-3 ${outbound ? 'items-end' : 'items-start'}`}>
        <View className="max-w-[85%] rounded-2xl bg-neutral-100 px-3 py-2">
          <Text className="text-sm italic text-neutral-500">Message deleted</Text>
        </View>
      </View>
    )
  }

  return (
    <View className={`my-1 flex-row px-3 ${outbound ? 'justify-end' : 'justify-start'}`}>
      {showRetry && onRetry ? (
        <Pressable
          onPress={() => onRetry(message)}
          hitSlop={10}
          className="mr-2 self-center"
          accessibilityLabel="Retry send"
        >
          <RetryIcon />
        </Pressable>
      ) : null}

      <Pressable
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={280}
        className={`${bubbleClass} ${isAudio ? 'min-w-[280px] max-w-[92%] px-2.5 py-1.5' : 'max-w-[85%] px-3 py-2.5'}`}
      >
        {message.replyTo ? (
          <View className="mb-2 border-l-2 border-wa-teal/60 pl-2">
            <Text numberOfLines={2} className="text-xs text-neutral-500">
              {replySnippet(message.replyTo)}
            </Text>
          </View>
        ) : null}

        {isMedia && (
          <MediaMessage
            message={message}
            variant={outbound ? 'outbound' : 'inbound'}
          />
        )}

        {message.body ? (
          <Text
            className={`text-[15px] leading-[21px] text-neutral-900 ${isMedia ? 'mt-2' : ''}`}
          >
            {message.body}
          </Text>
        ) : null}

        <View
          className={`flex-row items-center justify-end gap-1 ${isMedia ? (isAudio ? 'mt-0.5' : 'mt-1.5') : 'mt-1'}`}
        >
          {message.editedAt ? (
            <Text className="text-[10px] italic text-neutral-400">edited</Text>
          ) : null}
          {isQueuedOffline ? (
            <Text className="text-[10px] text-amber-600">Sending when online</Text>
          ) : null}
          <Text className="text-[11px] text-neutral-400">{formatTime(message.sentAt)}</Text>
          {outbound && !isQueuedOffline ? (
            <StatusTicks status={tickStatus} messageType={message.type} />
          ) : null}
        </View>
      </Pressable>
    </View>
  )
}

export const MessageBubble = memo(MessageBubbleBase)
