import { formatDateLabel } from '@/lib/format'
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
    items.push({ kind: 'message', id: msg.id, message: msg })
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

/** Reuse row objects when underlying message refs are unchanged (FlatList perf). */
export function stabilizeChatListItems(
  prev: ChatListItem[],
  next: ChatListItem[],
): ChatListItem[] {
  if (prev.length !== next.length) return next
  let stable = true
  const merged: ChatListItem[] = new Array(next.length)
  for (let i = 0; i < next.length; i++) {
    const row = next[i]
    const old = prev[i]
    if (
      old &&
      old.id === row.id &&
      old.kind === row.kind &&
      (row.kind === 'date'
        ? old.kind === 'date' && old.label === row.label
        : old.kind === 'message' &&
          row.kind === 'message' &&
          (old.message === row.message || messageRenderEqual(old.message, row.message)))
    ) {
      merged[i] = old
    } else {
      merged[i] = row
      stable = false
    }
  }
  return stable ? prev : merged
}
