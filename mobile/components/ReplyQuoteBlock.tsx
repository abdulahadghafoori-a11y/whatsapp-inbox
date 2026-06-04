import { Pressable, View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useMediaUrl } from '@/hooks/useMedia'
import { useCachedMediaUri } from '@/hooks/useCachedMediaUri'
import {
  replyHasMediaThumb,
  replyPreviewLabel,
  replyPreviewSnippet,
} from '@/lib/replyPreview'
import type { MessageReplyPreview } from '@/types'

const THUMB = 44

export function ReplyQuoteBlock({
  reply,
  contactName,
  isOutboundBubble,
  onPress,
}: {
  reply: MessageReplyPreview
  contactName: string
  isOutboundBubble?: boolean
  onPress?: (messageId: string) => void
}) {
  const outbound = isOutboundBubble ?? false
  const barColor = outbound ? '#128C7E' : '#06cf9c'
  const nameColor = outbound ? '#128C7E' : '#06cf9c'
  const bg = outbound ? 'rgba(18,140,126,0.08)' : 'rgba(0,0,0,0.04)'
  const showThumb = replyHasMediaThumb(reply)
  const cachedUri = useCachedMediaUri(reply.id)
  const remoteKey = reply.mediaUrl && !reply.localPreviewUri && !cachedUri ? reply.mediaUrl : null
  const { data: remoteUrl } = useMediaUrl(remoteKey)
  const thumbUri = cachedUri ?? reply.localPreviewUri ?? remoteUrl ?? null

  const content = (
    <View className="flex-row overflow-hidden rounded-lg" style={{ backgroundColor: bg }}>
      <View style={{ width: 4, backgroundColor: barColor }} />
      <View className="min-h-[44px] flex-1 flex-row items-center gap-2 px-2.5 py-1.5">
        {showThumb && thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumb}
            contentFit="cover"
          />
        ) : null}
        <View className="min-w-0 flex-1 justify-center py-0.5">
          <Text
            numberOfLines={1}
            className="text-[13px] font-semibold"
            style={{ color: nameColor }}
          >
            {replyPreviewLabel(reply, contactName)}
          </Text>
          <Text numberOfLines={showThumb ? 1 : 2} className="text-[13px] leading-[18px] text-neutral-600">
            {replyPreviewSnippet(reply)}
          </Text>
        </View>
      </View>
    </View>
  )

  if (!onPress) {
    return <View className="mb-2">{content}</View>
  }

  return (
    <Pressable
      onPress={() => onPress(reply.id)}
      className="mb-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel="Go to quoted message"
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
})
