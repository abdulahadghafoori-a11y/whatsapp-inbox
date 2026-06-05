import * as Haptics from 'expo-haptics'

/**
 * Thin, crash-proof wrapper around expo-haptics. Haptics are a "nice to have"
 * tactile layer — every call is best-effort and silently ignores failures
 * (unsupported hardware, web, simulators, permission edge cases).
 */

export function hapticLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

export function hapticMedium() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

export function hapticHeavy() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
}

export function hapticSelection() {
  void Haptics.selectionAsync().catch(() => {})
}

export function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

export function hapticWarning() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
}

export function hapticError() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
}
