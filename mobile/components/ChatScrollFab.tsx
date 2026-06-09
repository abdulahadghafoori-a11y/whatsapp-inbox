import { useSyncExternalStore } from 'react'
import { ScrollToLatestButton } from '@/components/ScrollToLatestButton'
import {
  getChatFabSnapshot,
  setChatFabUnread,
  setChatFabVisible,
  subscribeChatFab,
} from '@/lib/chatFabState'

type ChatScrollFabProps = {
  recordingOpen: boolean
  onPress: () => void
  bottomInset?: number
}

export function ChatScrollFab({
  recordingOpen,
  onPress,
  bottomInset = 12,
}: ChatScrollFabProps) {
  const { visible, unread } = useSyncExternalStore(
    subscribeChatFab,
    getChatFabSnapshot,
    getChatFabSnapshot,
  )

  const handlePress = () => {
    setChatFabVisible(false)
    setChatFabUnread(0)
    onPress()
  }

  return (
    <ScrollToLatestButton
      visible={visible && !recordingOpen}
      onPress={handlePress}
      unreadCount={unread}
      bottomInset={bottomInset}
    />
  )
}
