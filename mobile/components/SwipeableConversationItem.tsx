import { memo, useCallback, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { ConversationItem } from '@/components/ConversationItem'
import type { ConversationListItem } from '@/types'

const ACTION_WIDTH = 88

type SwipeableConversationItemProps = {
  conversation: ConversationListItem
  onPress: (id: string) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onSwipeOpen?: (id: string, ref: Swipeable | null) => void
}

function SwipeableConversationItemBase({
  conversation,
  onPress,
  onMarkRead,
  onMarkUnread,
  onSwipeOpen,
}: SwipeableConversationItemProps) {
  const swipeRef = useRef<Swipeable>(null)
  const isUnread = conversation.unreadCount > 0

  const close = useCallback(() => {
    swipeRef.current?.close()
  }, [])

  const handleAction = useCallback(() => {
    if (isUnread) onMarkRead(conversation.id)
    else onMarkUnread(conversation.id)
    close()
  }, [close, conversation.id, isUnread, onMarkRead, onMarkUnread])

  const renderLeftActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const translateX = dragX.interpolate({
        inputRange: [0, ACTION_WIDTH],
        outputRange: [-ACTION_WIDTH, 0],
        extrapolate: 'clamp',
      })

      const bg = isUnread ? '#128C7E' : '#6b7280'

      return (
        <Animated.View
          style={{
            width: ACTION_WIDTH,
            transform: [{ translateX }],
          }}
          className="justify-center"
        >
          <Pressable
            onPress={handleAction}
            style={{ backgroundColor: bg, width: ACTION_WIDTH }}
            className="h-full items-center justify-center"
          >
            <Text className="text-sm font-semibold text-white">
              {isUnread ? 'Read' : 'Unread'}
            </Text>
          </Pressable>
        </Animated.View>
      )
    },
    [handleAction, isUnread],
  )

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      overshootLeft={false}
      friction={2}
      leftThreshold={ACTION_WIDTH / 2}
      onSwipeableWillOpen={() => onSwipeOpen?.(conversation.id, swipeRef.current)}
    >
      <View className="bg-white">
        <ConversationItem conversation={conversation} onPress={onPress} />
      </View>
    </Swipeable>
  )
}

export const SwipeableConversationItem = memo(SwipeableConversationItemBase)
