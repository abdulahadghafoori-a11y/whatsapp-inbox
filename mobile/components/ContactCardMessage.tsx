import { View, Text, Linking, Pressable } from 'react-native'
import type { Message } from '@/types'

type WaContact = {
  name?: { formatted_name?: string; first_name?: string }
  phones?: Array<{ phone?: string; type?: string }>
}

/** Inbound WhatsApp contact (vCard) messages. */
export function ContactCardMessage({ message }: { message: Message }) {
  const raw = message.metadata as { contacts?: WaContact[] } | null | undefined
  const cards = raw?.contacts ?? []
  if (!cards.length) {
    return <Text className="text-[15px] text-neutral-700 dark:text-neutral-300">Contact</Text>
  }

  return (
    <View className="gap-2">
      {cards.map((c, i) => {
        const name =
          c.name?.formatted_name ?? c.name?.first_name ?? 'Contact'
        const phone = c.phones?.[0]?.phone
        return (
          <View key={i} className="rounded-lg bg-black/5 px-3 py-2">
            <Text className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">👤 {name}</Text>
            {phone ? (
              <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)}>
                <Text className="mt-1 text-[14px] text-wa-teal">{phone}</Text>
              </Pressable>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
