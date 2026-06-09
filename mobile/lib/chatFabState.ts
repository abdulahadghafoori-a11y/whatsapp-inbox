/** Scroll FAB visibility without re-rendering the chat screen on every scroll tick. */

let fabVisible = false
let fabUnread = 0
const listeners = new Set<() => void>()

/** Stable reference for useSyncExternalStore — must not allocate when values are unchanged. */
let fabSnapshot = { visible: fabVisible, unread: fabUnread }

function emit(): void {
  listeners.forEach((cb) => cb())
}

function refreshFabSnapshot(): void {
  if (fabSnapshot.visible === fabVisible && fabSnapshot.unread === fabUnread) return
  fabSnapshot = { visible: fabVisible, unread: fabUnread }
}

export function subscribeChatFab(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getChatFabSnapshot(): { visible: boolean; unread: number } {
  return fabSnapshot
}

export function setChatFabVisible(visible: boolean): void {
  if (fabVisible === visible) return
  fabVisible = visible
  refreshFabSnapshot()
  emit()
}

export function setChatFabUnread(unread: number): void {
  if (fabUnread === unread) return
  fabUnread = unread
  refreshFabSnapshot()
  emit()
}

export function resetChatFab(): void {
  if (!fabVisible && fabUnread === 0) return
  fabVisible = false
  fabUnread = 0
  refreshFabSnapshot()
  emit()
}
