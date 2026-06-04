import type { StyleProp, ViewStyle } from 'react-native'
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer'

/** Inline video thumbnail with play overlay — tap parent to open fullscreen. */
export function ChatVideo({
  url,
  style,
}: {
  url: string
  style?: StyleProp<ViewStyle>
}) {
  return <InteractiveVideoPlayer url={url} style={style} compact />
}
