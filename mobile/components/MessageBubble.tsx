import { memo } from 'react'
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { MediaMessage } from './MediaMessage'
import { LocationMessage } from './LocationMessage'
import { ContactCardMessage } from './ContactCardMessage'
import { InteractiveMessage } from './InteractiveMessage'
import { MessageMeta } from './MessageMeta'
import { RetryIcon } from './ChatIcons'
import { ReplyQuoteBlock } from './ReplyQuoteBlock'
import { isStalePendingMessage } from '@/lib/messageStalePending'
import { outboundFailureLabel } from '@/lib/mediaSendErrors'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { Message } from '@/types'

function MessageBubbleBase({
  message,
  contactName,
  contactAvatarUrl,
  onRetry,
  onLongPress,
  onReplyQuotePress,
  highlight,
}: {
  message: Message
  contactName: string
  contactAvatarUrl?: string | null
  onRetry?: (m: Message) => void
  onLongPress?: (m: Message) => void
  onReplyQuotePress?: (messageId: string) => void
  highlight?: boolean
}) {
  const { width: screenW } = useWindowDimensions()
  const bubbleMaxW = Math.round(screenW * 0.82)

  const outbound = message.direction === 'outbound'
  const isLocation = message.type === 'location'
  const isContacts = message.type === 'contacts'
  const isInteractive = message.type === 'interactive' || message.type === 'button'
  const isMedia =
    message.type !== 'text' && !isLocation && !isContacts && !isInteractive
  const isAudio = message.type === 'audio'
  const isVisualMedia =
    message.type === 'image' || message.type === 'video' || message.type === 'sticker'
  const hasCaption = !!message.body && !isLocation && !isContacts && !isInteractive
  const mediaOnly = isVisualMedia && !hasCaption
  const deleted = !!message.deletedAt
  const failed = outbound && message.status === 'failed'
  const sending = outbound && message.status === 'pending'
  const stalePending =
    outbound && isStalePendingMessage(message.status, message.sentAt, message.type, message.sendPhase)
  const showRetry = failed || stalePending
  const isQueuedOffline =
    message.id.startsWith('pending-text-') || message.sendPhase === 'queued'
  const tickStatus =
    failed || stalePending
      ? 'failed'
      : sending || message.id.startsWith('pending-media-')
        ? 'pending'
        : message.status
  const mediaBordered =
    outbound && (isLocation || isVisualMedia || message.type === 'video')

  const bubbleClass = failed || stalePending
    ? 'rounded-2xl rounded-br-sm border border-[#e8b4b4] bg-[#f5d5d5] dark:border-[#7a3a3a] dark:bg-[#5a2a2a]'
    : sending
      ? 'rounded-2xl rounded-br-sm bg-wa-light/90 opacity-95 dark:bg-wa-bubbleOut/90'
      : outbound
        ? 'rounded-2xl rounded-br-sm bg-wa-light dark:bg-wa-bubbleOut'
        : 'rounded-2xl rounded-bl-sm border border-black/[0.04] bg-white dark:border-transparent dark:bg-wa-bubbleIn'

  const echoFromWaApp =
    outbound &&
    message.metadata &&
    typeof message.metadata === 'object' &&
    (message.metadata as Record<string, unknown>).source === 'message_echo'

  const meta = (
    <MessageMeta
      sentAt={message.sentAt}
      outbound={outbound && !isQueuedOffline}
      status={tickStatus}
      messageType={message.type}
      overlay={mediaOnly}
    />
  )

  if (deleted) {
    return (
      <View className={`my-0.5 px-1.5 ${outbound ? 'items-end' : 'items-start'}`}>
        <View
          style={{ maxWidth: bubbleMaxW }}
          className="rounded-2xl bg-neutral-100 px-3 py-2 dark:bg-wa-bubbleIn"
        >
          <Text className="text-sm italic text-neutral-500 dark:text-wa-subDark">Message deleted</Text>
        </View>
      </View>
    )
  }

  return (
    <View className={`my-0.5 px-1.5 ${outbound ? 'items-end' : 'items-start'}`}>
      <View className={`flex-row ${outbound ? 'justify-end' : 'justify-start'}`}>
      {showRetry && onRetry ? (
        <Pressable
          onPress={() => onRetry(message)}
          hitSlop={10}
          className="mr-2 self-center items-center"
          accessibilityLabel={outboundFailureLabel(message.errorMessage)}
        >
          <RetryIcon />
        </Pressable>
      ) : null}

      <Pressable
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={280}
        style={[
          { maxWidth: bubbleMaxW },
          highlight ? { opacity: 1 } : undefined,
          mediaOnly && styles.mediaBubble,
          mediaBordered && styles.mediaBorder,
        ]}
        className={`${bubbleClass} ${highlight ? 'border-2 border-wa-teal/50' : ''} ${
          isAudio
            ? 'min-w-[296px] px-2 py-1.5'
            : isLocation
              ? 'p-1'
              : mediaOnly
                ? 'p-1'
                : 'px-2.5 py-1.5'
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
        {isContacts ? <ContactCardMessage message={message} /> : null}
        {isInteractive ? <InteractiveMessage message={message} /> : null}

        {isMedia ? (
          <View style={mediaOnly ? styles.mediaWrap : undefined}>
            <MediaMessage
              message={message}
              variant={outbound ? 'outbound' : 'inbound'}
              contactName={contactName}
              contactAvatarUrl={contactAvatarUrl}
              onReplyQuotePress={onReplyQuotePress}
            />
            {mediaOnly ? <View style={styles.mediaMeta}>{meta}</View> : null}
          </View>
        ) : null}

        {hasCaption ? (
          <Text className="mt-1 text-[15px] leading-[21px] text-neutral-900 dark:text-wa-textDark">
            {message.body}
          </Text>
        ) : null}

        {!mediaOnly && !isAudio ? (
          <View className={`flex-row justify-end ${isMedia && hasCaption ? 'mt-1.5' : 'mt-0.5'}`}>
            {meta}
          </View>
        ) : null}
      </Pressable>
      </View>
      {echoFromWaApp ? (
        <Text className="mt-0.5 text-[11px] text-neutral-400 dark:text-wa-subDark">
          Sent from WhatsApp app
        </Text>
      ) : null}
      {showRetry && (failed || stalePending) && message.errorMessage ? (
        <Text className="mt-0.5 max-w-[82%] text-[11px] text-red-600 dark:text-red-300">
          {outboundFailureLabel(message.errorMessage)}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  mediaBubble: {
    overflow: 'hidden',
  },
  mediaBorder: {
    borderWidth: 1,
    borderColor: '#128C7E',
  },
  mediaWrap: {
    position: 'relative',
  },
  mediaMeta: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
})

export const MessageBubble = memo(MessageBubbleBase, (prev, next) =>
  prev.highlight === next.highlight &&
  prev.contactName === next.contactName &&
  prev.contactAvatarUrl === next.contactAvatarUrl &&
  messageRenderEqual(prev.message, next.message) &&
  prev.onRetry === next.onRetry &&
  prev.onLongPress === next.onLongPress &&
  prev.onReplyQuotePress === next.onReplyQuotePress,
)
