/** Scroll FAB visibility without re-rendering the chat screen on every scroll tick. */

let fabVisible = false
let fabUnread = 0
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((cb) => cb())
}

export function subscribeChatFab(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getChatFabSnapshot(): { visible: boolean; unread: number } {
  return { visible: fabVisible, unread: fabUnread }
}

export function setChatFabVisible(visible: boolean): void {
  if (fabVisible === visible) return
  fabVisible = visible
  emit()
}

export function setChatFabUnread(unread: number): void {
  if (fabUnread === unread) return
  fabUnread = unread
  emit()
}

export function resetChatFab(): void {
  fabVisible = false
  fabUnread = 0
  emit()
}
