import { View, Text, Pressable } from 'react-native'
import type { MessageReaction } from '@/types'

export function MessageReactionsBar({
  reactions,
  outbound,
  onPressReaction,
}: {
  reactions: MessageReaction[]
  outbound?: boolean
  onPressReaction?: (emoji: string) => void
}) {
  if (!reactions.length) return null

  const grouped = new Map<string, number>()
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1)
  }

  return (
    <View
      className={`mt-1 flex-row flex-wrap gap-1 ${outbound ? 'justify-end' : 'justify-start'}`}
    >
      {[...grouped.entries()].map(([emoji, count]) => (
        <Pressable
          key={emoji}
          onPress={() => onPressReaction?.(emoji)}
          className="flex-row items-center rounded-full bg-white px-2 py-0.5 dark:bg-wa-elevated"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 1,
          }}
        >
          <Text className="text-[14px]">{emoji}</Text>
          {count > 1 ? (
            <Text className="ml-1 text-[11px] text-neutral-500 dark:text-wa-subDark">{count}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}
