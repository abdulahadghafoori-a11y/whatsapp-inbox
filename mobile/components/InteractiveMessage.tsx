import { View, Text } from 'react-native'
import type { Message } from '@/types'

type InteractivePayload = {
  type?: string
  button_reply?: { id?: string; title?: string }
  list_reply?: { id?: string; title?: string; description?: string }
}

/** Inbound button/list replies and interactive templates. */
export function InteractiveMessage({ message }: { message: Message }) {
  const interactive = (message.metadata as { interactive?: InteractivePayload } | null)?.interactive
  const title =
    interactive?.button_reply?.title ??
    interactive?.list_reply?.title ??
    message.body ??
    'Interactive message'
  const description = interactive?.list_reply?.description

  return (
    <View>
      <Text className="text-[15px] font-medium text-neutral-900 dark:text-neutral-100">{title}</Text>
      {description ? (
        <Text className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">{description}</Text>
      ) : null}
    </View>
  )
}
