import { Ionicons } from '@expo/vector-icons'
import { MicIcon } from '@/components/ChatIcons'
import type { MessageStatus, MessageType } from '@/types'

const GRAY = '#8696a0'
const BLUE = '#53bdeb'

/**
 * WhatsApp outbound receipt UI:
 * - pending → clock
 * - sent → single gray ✓
 * - delivered → double gray ✓✓
 * - read → double blue ✓✓
 * - played → blue mic (voice notes only)
 */
export function StatusTicks({
  status,
  messageType,
}: {
  status: MessageStatus
  messageType?: MessageType
}) {
  if (status === 'failed') {
    return <Ionicons name="alert-circle" size={15} color="#ef4444" />
  }
  if (status === 'pending') {
    return <Ionicons name="time-outline" size={14} color={GRAY} />
  }
  if (status === 'played') {
    return messageType === 'audio' ? (
      <MicIcon size={15} color={BLUE} />
    ) : (
      <Ionicons name="checkmark-done" size={16} color={BLUE} />
    )
  }
  if (status === 'read') {
    return <Ionicons name="checkmark-done" size={16} color={BLUE} />
  }
  if (status === 'delivered') {
    return <Ionicons name="checkmark-done" size={16} color={GRAY} />
  }
  return <Ionicons name="checkmark" size={15} color={GRAY} />
}
