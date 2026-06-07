import { View, Text, StyleSheet } from 'react-native'
import { StatusTicks } from '@/components/StatusTicks'
import { formatMessageTime } from '@/lib/format'
import type { Message } from '@/types'

type MessageMetaProps = {
  sentAt: string | null
  outbound?: boolean
  status?: Message['status']
  messageType?: Message['type']
  /** White text on dark gradient (image/video without caption). */
  overlay?: boolean
}

export function MessageMeta({
  sentAt,
  outbound,
  status,
  messageType,
  overlay = false,
}: MessageMetaProps) {
  const time = formatMessageTime(sentAt)
  const textStyle = overlay ? styles.timeOverlay : styles.timeInline

  return (
    <View style={[styles.row, overlay && styles.rowOverlay]}>
      <Text style={textStyle}>{time}</Text>
      {outbound && status ? (
        <StatusTicks status={status} messageType={messageType} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  rowOverlay: {
    backgroundColor: 'rgba(11, 20, 26, 0.45)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeInline: {
    fontSize: 11,
    color: '#8696a0',
  },
  timeOverlay: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
  },
})
