import { memo, useCallback, useRef } from 'react'
import { Animated, Pressable, View } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { Ionicons } from '@expo/vector-icons'
import { MessageBubble } from '@/components/MessageBubble'
import type { MessageAnchor } from '@/components/MessageActionsOverlay'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { Message } from '@/types'

const REPLY_ACTION_WIDTH = 56
const REPLY_TRIGGER = 44

type SwipeableMessageBubbleProps = {
  message: Message
  contactName: string
  contactAvatarUrl?: string | null
  onReply: (m: Message) => void
  onRetry?: (m: Message) => void
  onLongPress?: (m: Message, anchor: MessageAnchor) => void
  onReplyQuotePress?: (messageId: string) => void
  onSwipeOpen?: (id: string, ref: Swipeable | null) => void
  highlight?: boolean
}

function SwipeableMessageBubbleBase({
  message,
  contactName,
  contactAvatarUrl,
  onReply,
  onRetry,
  onLongPress,
  onReplyQuotePress,
  onSwipeOpen,
  highlight,
}: SwipeableMessageBubbleProps) {
  const swipeRef = useRef<Swipeable>(null)
  const rowRef = useRef<View>(null)
  const repliedRef = useRef(false)
  const deleted = !!message.deletedAt

  const triggerReply = useCallback(() => {
    if (repliedRef.current) return
    repliedRef.current = true
    onReply(message)
    requestAnimationFrame(() => {
      swipeRef.current?.close()
      setTimeout(() => {
        repliedRef.current = false
      }, 300)
    })
  }, [message, onReply])

  const handleLongPress = useCallback(() => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(message, { x, y, width, height })
    })
  }, [message, onLongPress])

  const renderLeftActions = useCallback(
    (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const translateX = dragX.interpolate({
        inputRange: [0, REPLY_ACTION_WIDTH],
        outputRange: [-REPLY_ACTION_WIDTH, 0],
        extrapolate: 'clamp',
      })
      const opacity = dragX.interpolate({
        inputRange: [0, REPLY_TRIGGER, REPLY_ACTION_WIDTH],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      })
      const scale = dragX.interpolate({
        inputRange: [0, REPLY_ACTION_WIDTH],
        outputRange: [0.5, 1],
        extrapolate: 'clamp',
      })

      return (
        <Animated.View
          style={{
            width: REPLY_ACTION_WIDTH,
            opacity,
            transform: [{ translateX }, { scale }],
          }}
          className="items-center justify-center"
        >
          <Pressable
            onPress={triggerReply}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-wa-teal/15 dark:bg-wa-green/20"
            accessibilityLabel="Reply"
          >
            <Ionicons name="arrow-undo" size={22} color="#008069" />
          </Pressable>
        </Animated.View>
      )
    },
    [triggerReply],
  )

  const bubble = (
    <MessageBubble
      message={message}
      contactName={contactName}
      contactAvatarUrl={contactAvatarUrl}
      onRetry={onRetry}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onReplyQuotePress={onReplyQuotePress}
      highlight={highlight}
    />
  )

  if (deleted) {
    return (
      <View ref={rowRef} collapsable={false}>
        {bubble}
      </View>
    )
  }

  return (
    <View ref={rowRef} collapsable={false}>
      <Swipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        overshootLeft={false}
        overshootFriction={8}
        friction={1.4}
        leftThreshold={REPLY_TRIGGER}
        onSwipeableWillOpen={(direction) => {
          onSwipeOpen?.(message.id, swipeRef.current)
          if (direction === 'left') triggerReply()
        }}
      >
        <View className="bg-wa-bg dark:bg-wa-chatDark">{bubble}</View>
      </Swipeable>
    </View>
  )
}

export const SwipeableMessageBubble = memo(SwipeableMessageBubbleBase, (prev, next) =>
  prev.highlight === next.highlight &&
  prev.contactName === next.contactName &&
  prev.contactAvatarUrl === next.contactAvatarUrl &&
  messageRenderEqual(prev.message, next.message) &&
  prev.onReply === next.onReply &&
  prev.onRetry === next.onRetry &&
  prev.onLongPress === next.onLongPress &&
  prev.onReplyQuotePress === next.onReplyQuotePress &&
  prev.onSwipeOpen === next.onSwipeOpen,
)
