import { PlatformPressable } from '@react-navigation/elements'
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import { inboxScrollToTop } from '@/lib/inboxScroll'

/** Inbox tab: tap while already on Inbox scrolls the conversation list to the top. */
export function InboxTabButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPress={(e) => {
        if (props.accessibilityState?.selected) {
          inboxScrollToTop()
        }
        props.onPress?.(e)
      }}
    />
  )
}
