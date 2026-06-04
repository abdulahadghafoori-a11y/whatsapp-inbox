import { type ReactNode } from 'react'
import { Pressable, Text, View, StyleSheet, Dimensions } from 'react-native'
import { PresentationModal } from '@/components/PresentationModal'
import { ForwardIcon, ReplySwipeIcon } from '@/components/ChatIcons'
import { MessageBubble } from '@/components/MessageBubble'
import type { Message } from '@/types'

const SCREEN_H = Dimensions.get('window').height

export type MessageAnchor = {
  x: number
  y: number
  width: number
  height: number
}

function ActionChip({
  label,
  icon,
  onPress,
}: {
  label: string
  icon: ReactNode
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-w-[72px] items-center gap-1.5 rounded-xl bg-white px-2.5 py-2.5 shadow-sm"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-neutral-50">
        {icon}
      </View>
      <Text className="text-center text-[10px] font-medium leading-tight text-neutral-800">
        {label}
      </Text>
    </Pressable>
  )
}

export function MessageActionsOverlay({
  message,
  anchor,
  contactName,
  visible,
  onClose,
  onReply,
  onForward,
}: {
  message: Message | null
  anchor: MessageAnchor | null
  contactName: string
  visible: boolean
  onClose: () => void
  onReply: (m: Message) => void
  onForward: (m: Message) => void
}) {
  if (!message || !anchor) return null
  const msg: Message = message

  const menuTop = Math.min(anchor.y + anchor.height + 10, SCREEN_H - 120)
  const popTop = Math.max(72, anchor.y - 6)

  return (
    <PresentationModal visible={visible} onClose={onClose} animationType="fade" transparent>
      <Pressable style={styles.dim} onPress={onClose} accessibilityRole="button" />
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          pointerEvents="none"
          style={[
            styles.popWrap,
            { top: popTop, left: anchor.x, width: anchor.width },
          ]}
        >
          <View style={styles.popShadow}>
            <MessageBubble message={msg} contactName={contactName} />
          </View>
        </View>

        <View style={[styles.menuRow, { top: menuTop }]} className="flex-row justify-center gap-3 px-3">
          <ActionChip
            label="Reply"
            icon={<ReplySwipeIcon size={22} color="#128C7E" />}
            onPress={() => {
              onReply(msg)
              onClose()
            }}
          />
          <ActionChip
            label="Forward"
            icon={<ForwardIcon size={22} />}
            onPress={() => {
              onForward(msg)
              onClose()
            }}
          />
        </View>
      </View>
    </PresentationModal>
  )
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  popWrap: { position: 'absolute', transform: [{ scale: 1.03 }] },
  popShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuRow: { position: 'absolute', left: 0, right: 0 },
})
