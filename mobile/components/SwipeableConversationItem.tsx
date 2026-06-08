import { memo, useCallback, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import { Ionicons } from '@expo/vector-icons'
import { ConversationItem } from '@/components/ConversationItem'
import { hapticLight } from '@/lib/haptics'
import { conversationInboxEqual } from '@/lib/inboxList'
import type { ConversationListItem } from '@/types'

const ACTION_WIDTH = 80
const ACTIONS_WIDTH = ACTION_WIDTH * 2

type SwipeableConversationItemProps = {
  conversation: ConversationListItem
  onPress: (id: string) => void
  onLongPress?: (id: string) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onSwipeOpen?: (id: string, ref: Swipeable | null) => void
}

function SwipeableConversationItemBase({
  conversation,
  onPress,
  onLongPress,
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
    hapticLight()
    if (isUnread) onMarkRead(conversation.id)
    else onMarkUnread(conversation.id)
    close()
  }, [close, conversation.id, isUnread, onMarkRead, onMarkUnread])

  const handlePinToggle = useCallback(() => {
    hapticLight()
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

      // Icons spring in from slightly small + faded for a smooth, premium reveal.
      const iconScale = progress.interpolate({
        inputRange: [0, 0.6, 1],
        outputRange: [0.4, 0.85, 1],
        extrapolate: 'clamp',
      })
      const iconOpacity = progress.interpolate({
        inputRange: [0, 0.4, 1],
        outputRange: [0, 0.6, 1],
        extrapolate: 'clamp',
      })

      const readBg = isUnread ? '#00A884' : '#5B7083'
      const pinBg = isPinned ? '#C2791F' : '#F4A621'
      const iconAnim = {
        transform: [{ scale: iconScale }],
        opacity: iconOpacity,
      }

      return (
        <Animated.View
          style={{
            width: ACTIONS_WIDTH,
            flexDirection: 'row',
            transform: [{ translateX }],
          }}
        >
          <Pressable
            onPress={handlePinToggle}
            style={{ width: ACTION_WIDTH, backgroundColor: pinBg }}
            className="h-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isPinned ? 'Unpin chat' : 'Pin chat'}
          >
            <Animated.View style={iconAnim} className="items-center">
              <Ionicons name={isPinned ? 'pin-outline' : 'pin'} size={22} color="#ffffff" />
              <Text className="mt-1 text-[11px] font-semibold text-white">
                {isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={handleReadToggle}
            style={{ width: ACTION_WIDTH, backgroundColor: readBg }}
            className="h-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            <Animated.View style={iconAnim} className="items-center">
              <Ionicons
                name={isUnread ? 'checkmark-done' : 'ellipse'}
                size={22}
                color="#ffffff"
              />
              <Text className="mt-1 text-[11px] font-semibold text-white">
                {isUnread ? 'Read' : 'Unread'}
              </Text>
            </Animated.View>
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
      overshootFriction={8}
      friction={1.8}
      leftThreshold={ACTION_WIDTH * 0.7}
      onSwipeableWillOpen={() => onSwipeOpen?.(conversation.id, swipeRef.current)}
    >
      <View className="bg-white dark:bg-wa-panelDeep">
        <ConversationItem
          variant="inbox"
          conversation={conversation}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      </View>
    </Swipeable>
  )
}

export const SwipeableConversationItem = memo(
  SwipeableConversationItemBase,
  (prev, next) =>
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onMarkRead === next.onMarkRead &&
    prev.onMarkUnread === next.onMarkUnread &&
    prev.onTogglePin === next.onTogglePin &&
    prev.onSwipeOpen === next.onSwipeOpen &&
    conversationInboxEqual(prev.conversation, next.conversation),
)
