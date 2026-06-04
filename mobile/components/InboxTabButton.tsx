import { useRef } from 'react'
import { PlatformPressable } from '@react-navigation/elements'
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import { inboxScrollToTop } from '@/lib/inboxScroll'

const DOUBLE_TAP_MS = 350

/** Inbox tab: double-tap while focused scrolls the conversation list to the top. */
export function InboxTabButton(props: BottomTabBarButtonProps) {
  const lastTap = useRef(0)

  return (
    <PlatformPressable
      {...props}
      onPress={(e) => {
        const now = Date.now()
        if (props.accessibilityState?.selected && now - lastTap.current < DOUBLE_TAP_MS) {
          inboxScrollToTop()
          lastTap.current = 0
          return
        }
        lastTap.current = now
        props.onPress?.(e)
      }}
    />
  )
}
