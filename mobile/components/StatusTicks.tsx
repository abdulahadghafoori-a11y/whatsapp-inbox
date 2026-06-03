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
      <Text style={{ color: GRAY, fontSize: 12, lineHeight: 14, fontWeight: '500' }}>◔</Text>
    )
  }
  if (status === 'played' || (messageType === 'audio' && status === 'read')) {
    return <PlayedMic />
  }
  if (status === 'read') {
    return <DoubleCheck color={BLUE} />
  }
  if (status === 'delivered') {
    return <DoubleCheck color={GRAY} />
  }
  // sent (and any unknown) — single gray check
  return <Check color={GRAY} />
}
