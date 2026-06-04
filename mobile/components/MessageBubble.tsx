import { memo } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { MediaMessage } from './MediaMessage'
import { LocationMessage } from './LocationMessage'
import { StatusTicks } from './StatusTicks'
import { RetryIcon } from './ChatIcons'
import { ReplyQuoteBlock } from './ReplyQuoteBlock'
import { formatTime } from '@/lib/format'
import type { Message } from '@/types'

function MessageBubbleBase({
  message,
  contactName,
  onRetry,
  onLongPress,
  onReplyQuotePress,
  highlight,
}: {
  message: Message
  contactName: string
  onRetry?: (m: Message) => void
  onLongPress?: (m: Message) => void
  onReplyQuotePress?: (messageId: string) => void
  highlight?: boolean
}) {
  const outbound = message.direction === 'outbound'
  const isLocation = message.type === 'location'
  const isMedia = message.type !== 'text' && !isLocation
  const isAudio = message.type === 'audio'
  const isVisualMedia =
    message.type === 'image' || message.type === 'video' || message.type === 'sticker'
  const deleted = !!message.deletedAt
  const failed = outbound && message.status === 'failed'
  const sending = outbound && message.status === 'pending'
  const stalePending =
    sending && Date.now() - new Date(message.sentAt).getTime() > 45_000
  const showRetry = (failed || stalePending) && !sending
  const isQueuedOffline = message.id.startsWith('pending-text-')
  const isUploadingMedia = message.id.startsWith('pending-media-')
  const tickStatus = isUploadingMedia ? 'pending' : message.status
  const showSendingBanner =
    sending &&
    !isQueuedOffline &&
    !isUploadingMedia &&
    message.type !== 'text' &&
    (!isVisualMedia || isLocation)

  const bubbleClass = failed || stalePending
    ? 'rounded-2xl rounded-br-md border border-[#e8b4b4] bg-[#f5d5d5] shadow-sm'
    : sending
      ? 'rounded-2xl rounded-br-md bg-wa-light/90 shadow-sm opacity-95'
      : outbound
      ? 'rounded-2xl rounded-br-md bg-wa-light shadow-sm'
      : 'rounded-2xl rounded-bl-md border border-black/[0.04] bg-white shadow-sm'

  if (deleted) {
    return (
      <View className={`my-0.5 px-1.5 ${outbound ? 'items-end' : 'items-start'}`}>
        <View className="max-w-[85%] rounded-2xl bg-neutral-100 px-3 py-2">
          <Text className="text-sm italic text-neutral-500">Message deleted</Text>
        </View>
      </View>
    )
  }

  return (
    <View className={`my-0.5 flex-row px-1.5 ${outbound ? 'justify-end' : 'justify-start'}`}>
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
        style={highlight ? { opacity: 1 } : undefined}
        className={`${bubbleClass} ${
          highlight ? 'border-2 border-wa-teal/50' : ''
        } ${
          isAudio
            ? 'min-w-[260px] max-w-[94%] px-2 py-1.5'
            : isLocation
              ? 'max-w-[94%] p-1'
              : isVisualMedia && !message.body
                ? 'max-w-[94%] p-1'
                : 'max-w-[90%] px-2.5 py-2'
        }`}
      >
        {message.replyTo ? (
          <ReplyQuoteBlock
            reply={message.replyTo}
            contactName={contactName}
            isOutboundBubble={outbound}
            onPress={onReplyQuotePress}
          />
        ) : null}

        {isLocation ? <LocationMessage message={message} /> : null}

        {isMedia ? (
          <MediaMessage
            message={message}
            variant={outbound ? 'outbound' : 'inbound'}
            contactName={contactName}
            onReplyQuotePress={onReplyQuotePress}
          />
        ) : null}

        {message.body && !isLocation ? (
          <Text
            className={`text-[15px] leading-[21px] text-neutral-900 ${isMedia ? 'mt-2' : ''}`}
          >
            {message.body}
          </Text>
        ) : null}

        {showSendingBanner ? (
          <View className="mb-1.5 flex-row items-center justify-end gap-2 rounded-xl bg-wa-teal/12 px-3 py-2">
            <ActivityIndicator size="small" color="#128C7E" />
            <Text className="text-[13px] font-semibold text-wa-teal">Sending…</Text>
          </View>
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
