import { View, Text } from 'react-native'
import { MicIcon } from '@/components/ChatIcons'
import type { MessageStatus, MessageType } from '@/types'

const GRAY = '#8696a0'
const BLUE = '#53bdeb'

function Check({ color }: { color: string }) {
  return <Text style={{ color, fontSize: 13, lineHeight: 14, fontWeight: '600' }}>✓</Text>
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <View className="flex-row items-center" style={{ width: 18, height: 14 }}>
      <View style={{ position: 'absolute', left: 0 }}>
        <Check color={color} />
      </View>
      <View style={{ position: 'absolute', left: 5 }}>
        <Check color={color} />
      </View>
    </View>
  )
}

function PlayedMic() {
  return <MicIcon size={14} color={BLUE} />
}

/**
 * WhatsApp outbound receipt UI:
 * - pending → clock
 * - sent → single gray ✓
 * - delivered → double gray ✓✓
 * - read (seen) → double blue ✓✓  (voice notes too — not the mic)
 * - played → blue mic (voice notes only, after recipient listens)
 */
export function StatusTicks({
  status,
  messageType,
}: {
  status: MessageStatus
  messageType?: MessageType
}) {
  if (status === 'failed') {
    return <Text style={{ color: '#ef4444', fontSize: 13, lineHeight: 14 }}>✕</Text>
  }
  if (status === 'pending') {
    return (
      <Text style={{ color: '#128C7E', fontSize: 14, lineHeight: 16, fontWeight: '600' }}>
        ◷
      </Text>
    )
  }
  if (status === 'played') {
    return messageType === 'audio' ? <PlayedMic /> : <DoubleCheck color={BLUE} />
  }
  if (status === 'read') {
    return <DoubleCheck color={BLUE} />
  }
  if (status === 'delivered') {
    return <DoubleCheck color={GRAY} />
  }
  return <Check color={GRAY} />
}
