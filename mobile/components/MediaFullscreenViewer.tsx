import { StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated'
import { ZoomableImageViewer } from '@/components/ZoomableImageViewer'
import { ReplyQuoteBlock } from '@/components/ReplyQuoteBlock'
import { PresentationModal } from '@/components/PresentationModal'
import type { MessageReplyPreview } from '@/types'

export function MediaFullscreenViewer({
  visible,
  uri,
  onClose,
  replyTo,
  contactName,
  onReplyQuotePress,
}: {
  visible: boolean
  uri: string
  onClose: () => void
  replyTo?: MessageReplyPreview | null
  contactName?: string
  onReplyQuotePress?: (messageId: string) => void
}) {
  return (
    <PresentationModal visible={visible} onClose={onClose} animationType="fade" transparent>
      <StatusBar barStyle="light-content" />
      <Animated.View
        entering={FadeIn.duration(180)}
        style={{ flex: 1, backgroundColor: '#000' }}
      >
        {replyTo && contactName ? (
          <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0 z-10 px-3 pt-1">
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
          </SafeAreaView>
        ) : null}
        <Animated.View
          style={{ flex: 1 }}
          entering={ZoomIn.springify().damping(20).stiffness(180)}
        >
          <ZoomableImageViewer
            uri={uri}
            onRequestClose={onClose}
            enableDismissGesture
            backgroundColor="#000"
          />
        </Animated.View>
      </Animated.View>
    </PresentationModal>
  )
}
