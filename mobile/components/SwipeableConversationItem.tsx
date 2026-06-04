import { memo, useCallback, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { ConversationItem } from '@/components/ConversationItem'
import type { ConversationListItem } from '@/types'

const ACTION_WIDTH = 76
const ACTIONS_WIDTH = ACTION_WIDTH * 2

type SwipeableConversationItemProps = {
  conversation: ConversationListItem
  onPress: (id: string) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onSwipeOpen?: (id: string, ref: Swipeable | null) => void
}

function SwipeableConversationItemBase({
  conversation,
  onPress,
  onMarkRead,
  onMarkUnread,
  onTogglePin,
  onSwipeOpen,
}: SwipeableConversationItemProps) {
  const swipeRef = useRef<Swipeable>(null)
  const isUnread = conversation.unreadCount > 0
  const isPinned = !!conversation.pinnedAt

  const close = useCallback(() => {
    swipeRef.current?.close()
  }, [])

  const handleReadToggle = useCallback(() => {
    if (isUnread) onMarkRead(conversation.id)
    else onMarkUnread(conversation.id)
    close()
  }, [close, conversation.id, isUnread, onMarkRead, onMarkUnread])

  const handlePinToggle = useCallback(() => {
    onTogglePin(conversation.id, !isPinned)
    close()
  }, [close, conversation.id, isPinned, onTogglePin])

  const renderLeftActions = useCallback(
    (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const translateX = dragX.interpolate({
        inputRange: [0, ACTIONS_WIDTH],
        outputRange: [-ACTIONS_WIDTH, 0],
        extrapolate: 'clamp',
      })

      const scale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
        extrapolate: 'clamp',
      })

      const readBg = isUnread ? '#128C7E' : '#6b7280'
      const pinBg = isPinned ? '#d97706' : '#f59e0b'

      return (
        <Animated.View
          style={{
            width: ACTIONS_WIDTH,
            flexDirection: 'row',
            transform: [{ translateX }, { scale }],
          }}
        >
          <Pressable
            onPress={handlePinToggle}
            style={{ width: ACTION_WIDTH, backgroundColor: pinBg }}
            className="h-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isPinned ? 'Unpin chat' : 'Pin chat'}
          >
            <Text className="text-xl">{isPinned ? '📌' : '📍'}</Text>
            <Text className="mt-0.5 text-[11px] font-semibold text-white">
              {isPinned ? 'Unpin' : 'Pin'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleReadToggle}
            style={{ width: ACTION_WIDTH, backgroundColor: readBg }}
            className="h-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            <Text className="text-sm font-semibold text-white">
              {isUnread ? 'Read' : 'Unread'}
            </Text>
          </Pressable>
        </Animated.View>
      )
    },
    [handlePinToggle, handleReadToggle, isPinned, isUnread],
  )

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      overshootLeft={false}
      friction={2}
      leftThreshold={ACTION_WIDTH}
      onSwipeableWillOpen={() => onSwipeOpen?.(conversation.id, swipeRef.current)}
    >
      <View className="bg-white">
        <ConversationItem conversation={conversation} onPress={onPress} />
      </View>
    </Swipeable>
  )
}

export const SwipeableConversationItem = memo(SwipeableConversationItemBase)
