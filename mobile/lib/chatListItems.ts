import { formatDateLabel } from '@/lib/format'
import { messageListKey } from '@/lib/messageListKey'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { Message } from '@/types'

export type ChatListItem =
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'date'; id: string; dateIso: string; label: string }

export function dayKey(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Newest-first rows for an inverted FlatList, with date pills between day groups. */
export function buildChatListItems(messages: Message[]): ChatListItem[] {
  const reversed = [...messages].reverse()
  const items: ChatListItem[] = []

  for (let i = 0; i < reversed.length; i++) {
    const msg = reversed[i]
    items.push({ kind: 'message', id: messageListKey(msg), message: msg })
    const older = reversed[i + 1]
    if (!older || dayKey(msg.sentAt) !== dayKey(older.sentAt)) {
      items.push({
        // Stable per calendar day — never include the array index, or loading
        // older pages shifts indices and remounts every date row (scroll jumps).
        kind: 'date',
        id: `date-${dayKey(msg.sentAt)}`,
        dateIso: msg.sentAt,
        label: formatDateLabel(msg.sentAt),
      })
    }
  }

  return items
}

function chatListItemStable(old: ChatListItem, row: ChatListItem): boolean {
  if (old.id !== row.id || old.kind !== row.kind) return false
  if (row.kind === 'date') {
    return old.kind === 'date' && old.label === row.label
  }
  return (
    old.kind === 'message' &&
    row.kind === 'message' &&
    (old.message === row.message || messageRenderEqual(old.message, row.message))
  )
}

/** Reuse row objects when underlying message refs are unchanged (FlatList perf). */
export function stabilizeChatListItems(
  prev: ChatListItem[],
  next: ChatListItem[],
): ChatListItem[] {
  if (prev === next) return prev
  if (next.length === 0) return next

  const prevById = new Map(prev.map((row) => [row.id, row]))
  let allSameAsPrev = prev.length === next.length
  const merged: ChatListItem[] = new Array(next.length)

  for (let i = 0; i < next.length; i++) {
    const row = next[i]
    const old = prevById.get(row.id)
    if (old && chatListItemStable(old, row)) {
      merged[i] = old
      if (allSameAsPrev && old !== prev[i]) allSameAsPrev = false
    } else {
      merged[i] = row
      allSameAsPrev = false
    }
  }

  return allSameAsPrev ? prev : merged
}
