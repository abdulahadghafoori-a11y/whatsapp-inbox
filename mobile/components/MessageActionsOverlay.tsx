import { type ReactNode } from 'react'
import { Pressable, Text, View, StyleSheet, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PresentationModal } from '@/components/PresentationModal'
import { MessageBubble } from '@/components/MessageBubble'
import { REACTION_EMOJIS } from '@/hooks/useMessageFeatures'
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
      className="min-w-[72px] items-center gap-1.5 rounded-xl bg-white dark:bg-wa-panel px-2.5 py-2.5 shadow-sm"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-neutral-50 dark:bg-wa-elevated">
        {icon}
      </View>
      <Text className="text-center text-[10px] font-medium leading-tight text-neutral-800 dark:text-neutral-200">
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
  onCopy,
  onStar,
  onReact,
}: {
  message: Message | null
  anchor: MessageAnchor | null
  contactName: string
  visible: boolean
  onClose: () => void
  onReply: (m: Message) => void
  onForward: (m: Message) => void
  onCopy?: (m: Message) => void
  onStar?: (m: Message) => void
  onReact?: (m: Message, emoji: string) => void
}) {
  if (!message || !anchor) return null
  const msg: Message = message
  const canCopy = !!onCopy && !!msg.body?.trim()
  const starred = !!msg.starredAt

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

        <View style={[styles.reactionRow, { top: menuTop - 52 }]}>
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onReact?.(msg, emoji)
                onClose()
              }}
              className="mx-1 h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-wa-panel"
            >
              <Text className="text-[22px]">{emoji}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.menuRow, { top: menuTop }]} className="flex-row justify-center gap-3 px-3">
          <ActionChip
            label="Reply"
            icon={<Ionicons name="arrow-undo" size={22} color="#008069" />}
            onPress={() => {
              onReply(msg)
              onClose()
            }}
          />
          <ActionChip
            label="Forward"
            icon={<Ionicons name="arrow-redo" size={22} color="#008069" />}
            onPress={() => {
              onForward(msg)
              onClose()
            }}
          />
          {onStar ? (
            <ActionChip
              label={starred ? 'Unstar' : 'Star'}
              icon={
                <Ionicons
                  name={starred ? 'star' : 'star-outline'}
                  size={22}
                  color="#008069"
                />
              }
              onPress={() => {
                onStar(msg)
                onClose()
              }}
            />
          ) : null}
          {canCopy ? (
            <ActionChip
              label="Copy"
              icon={<Ionicons name="copy-outline" size={20} color="#008069" />}
              onPress={() => {
                onCopy?.(msg)
                onClose()
              }}
            />
          ) : null}
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
  reactionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  menuRow: { position: 'absolute', left: 0, right: 0 },
})
