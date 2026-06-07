import { formatDateLabel } from '@/lib/format'
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
        kind: 'date',
        id: `date-${dayKey(msg.sentAt)}-${i}`,
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
        : old.kind === 'message' && old.message === row.message)
    ) {
      merged[i] = old
    } else {
      merged[i] = row
      stable = false
    }
  }
  return stable ? prev : merged
}
