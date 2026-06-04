import { useEffect, useState } from 'react'
import {
  Pressable,
  StatusBar,
  Text,
  View,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer'
import { ReplyQuoteBlock } from '@/components/ReplyQuoteBlock'
import { PresentationModal } from '@/components/PresentationModal'
import { CloseIcon } from '@/components/ChatIcons'
import type { MessageReplyPreview } from '@/types'

export function VideoFullscreenViewer({
  visible,
  url,
  onClose,
  replyTo,
  contactName,
  onReplyQuotePress,
}: {
  visible: boolean
  url: string | null
  onClose: () => void
  replyTo?: MessageReplyPreview | null
  contactName?: string
  onReplyQuotePress?: (messageId: string) => void
}) {
  const insets = useSafeAreaInsets()
  const topPad = Math.max(insets.top, Platform.OS === 'android' ? 12 : 8)
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !url) {
      setPlayerUrl(null)
      return
    }
    setPlayerUrl(url)
  }, [visible, url])

  return (
    <PresentationModal visible={visible} onClose={onClose} animationType="slide" transparent>
      <StatusBar barStyle="light-content" />
      <View style={[styles.root, { paddingTop: topPad, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close video"
          >
            <CloseIcon size={26} color="#fff" />
          </Pressable>
        </View>

        {replyTo && contactName ? (
          <View style={styles.quoteWrap}>
            <ReplyQuoteBlock
              reply={replyTo}
              contactName={contactName}
              isOutboundBubble={false}
              onPress={
                onReplyQuotePress
                  ? (id) => {
                      onClose()
                      onReplyQuotePress(id)
                    }
                  : undefined
              }
            />
          </View>
        ) : null}

        <View style={styles.playerWrap}>
          {playerUrl ? (
            <InteractiveVideoPlayer
              url={playerUrl}
              fill
              expanded
              autoPlay
              onSwipeDismiss={onClose}
            />
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}
        </View>

        <Text style={styles.hint}>Swipe down to close</Text>
      </View>
    </PresentationModal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
    zIndex: 20,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  quoteWrap: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  playerWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    paddingBottom: 4,
  },
})
