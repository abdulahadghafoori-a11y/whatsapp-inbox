/** Which chat rows are on screen — media fetches/decodes only run for these ids. */

const visibleIds = new Set<string>()
/** Messages that were once visible keep showing media after scroll-away (WA-like). */
const activatedIds = new Set<string>()
const MAX_ACTIVATED_IDS = 10_000
const listeners = new Map<string, Set<() => void>>()
let globalListeners = new Set<() => void>()

function notify(id: string) {
  listeners.get(id)?.forEach((cb) => cb())
}

function notifyAll() {
  globalListeners.forEach((cb) => cb())
}

export function isMessageMediaActive(messageId: string | undefined): boolean {
  if (!messageId) return false
  return visibleIds.has(messageId)
}

export function hasMessageMediaBeenActivated(messageId: string | undefined): boolean {
  if (!messageId) return false
  return activatedIds.has(messageId)
}

function markMessageMediaActivated(messageId: string) {
  activatedIds.add(messageId)
  if (activatedIds.size <= MAX_ACTIVATED_IDS) return
  const oldest = activatedIds.values().next().value
  if (oldest) activatedIds.delete(oldest)
}

export function getVisibleMessageIds(): ReadonlySet<string> {
  return visibleIds
}

export function setVisibleMessageIds(ids: Iterable<string>) {
  const next = new Set(ids)
  const changed: string[] = []

  for (const id of visibleIds) {
    if (!next.has(id)) changed.push(id)
  }
  for (const id of next) {
    if (!visibleIds.has(id)) changed.push(id)
  }

  if (changed.length === 0) return

  visibleIds.clear()
  for (const id of next) {
    visibleIds.add(id)
    markMessageMediaActivated(id)
  }

  for (const id of changed) notify(id)
  notifyAll()
}

export function subscribeMessageMediaActive(messageId: string | undefined, cb: () => void): () => void {
  if (!messageId) return () => undefined
  let set = listeners.get(messageId)
  if (!set) {
    set = new Set()
    listeners.set(messageId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) listeners.delete(messageId)
  }
}

export function subscribeVisibleMessageMedia(cb: () => void): () => void {
  globalListeners.add(cb)
  return () => {
    globalListeners.delete(cb)
  }
}

export function clearVisibleMessageMedia() {
  if (visibleIds.size === 0) return
  const changed = [...visibleIds]
  visibleIds.clear()
  for (const id of changed) notify(id)
  notifyAll()
}
