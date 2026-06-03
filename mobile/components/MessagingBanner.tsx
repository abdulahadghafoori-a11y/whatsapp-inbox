import { View, Text } from 'react-native'
import { messagingBanner } from '@/lib/messaging'
import type { ConversationListItem } from '@/types'

const STYLES = {
  csw_warning: { bg: 'bg-orange-50', title: 'text-orange-800', body: 'text-orange-700' },
  csw_closed: { bg: 'bg-red-50', title: 'text-red-800', body: 'text-red-700' },
  fep_active: { bg: 'bg-sky-50', title: 'text-sky-900', body: 'text-sky-800' },
  fep_only: { bg: 'bg-purple-50', title: 'text-purple-900', body: 'text-purple-800' },
} as const

export function MessagingBanner({
  conversation,
}: {
  conversation: ConversationListItem | null | undefined
}) {
  const model = messagingBanner(conversation)
  if (model.variant === 'hidden') return null

  const s = STYLES[model.variant as keyof typeof STYLES]
  return (
    <View className={`px-4 py-2.5 ${s.bg}`}>
      <Text className={`text-center text-sm font-semibold ${s.title}`}>{model.title}</Text>
      <Text className={`mt-0.5 text-center text-xs leading-4 ${s.body}`}>{model.body}</Text>
    </View>
  )
}
