import { Platform, StyleSheet, type ViewStyle } from 'react-native'

/** Visible tab bar content height (excluding home-indicator safe area). */
export const TAB_BAR_CONTENT_HEIGHT = Platform.select({ ios: 49, android: 56, default: 49 }) ?? 49

/** Tab bar pinned to the physical bottom; home-indicator padding applied once. */
export function getDefaultTabBarStyle(bottomInset: number): ViewStyle {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingBottom: bottomInset,
    height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
  }
}

/** Native stack transitions for inbox chat and other pushes. */
export const stackTransitionOptions = {
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
  /** Edge-only back swipe — full-screen swipe fights vertical message scrolling. */
  fullScreenGestureEnabled: false,
  gestureResponseDistance: { start: 24 },
}

export const authStackOptions = {
  animation: 'fade' as const,
  animationDuration: 200,
}

export const modalPresentationOptions = {
  presentation: 'modal' as const,
  animation: 'slide_from_bottom' as const,
}
