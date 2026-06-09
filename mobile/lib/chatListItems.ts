import { formatDateLabel } from '@/lib/format'
import {
  CHAT_DATE_ROW_HEIGHT,
  estimateChatMessageRowHeight,
} from '@/lib/chatListItemLayout'
import { enrichChatListWithGroups } from '@/lib/chatListNeighbors'

/** Grouping iterates the full list on every update — disabled for scroll perf. */
const ENABLE_MESSAGE_GROUPING = false
import { messageListKey } from '@/lib/messageListKey'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import type { Message } from '@/types'

export type MessageGroupPosition = 'single' | 'first' | 'middle' | 'last'

export type ChatListItem =
  | {
      kind: 'message'
      id: string
      message: Message
      layoutHeight: number
      groupPosition?: MessageGroupPosition
      showAvatar?: boolean
      showTail?: boolean
    }
  | { kind: 'date'; id: string; dateIso: string; label: string; layoutHeight: number }

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
    items.push({
      kind: 'message',
      id: messageListKey(msg),
      message: msg,
      layoutHeight: estimateChatMessageRowHeight(msg),
    })
    const older = reversed[i + 1]
    if (!older || dayKey(msg.sentAt) !== dayKey(older.sentAt)) {
      items.push({
        // Stable per calendar day — never include the array index, or loading
        // older pages shifts indices and remounts every date row (scroll jumps).
        kind: 'date',
        id: `date-${dayKey(msg.sentAt)}`,
        dateIso: msg.sentAt,
        label: formatDateLabel(msg.sentAt),
        layoutHeight: CHAT_DATE_ROW_HEIGHT,
      })
    }
  }

  return ENABLE_MESSAGE_GROUPING ? enrichChatListWithGroups(items) : items
}

/** Layout/order fingerprint — excludes status ticks and media URL/cache updates. */
export function chatListStructureKey(messages: Message[]): string {
  return messages
    .map((m) =>
      [
        m.id,
        m.sentAt,
        m.type,
        m.deletedAt ?? '',
        m.body?.length ?? 0,
        m.mediaWidth ?? 0,
        m.mediaHeight ?? 0,
        m.replyTo?.id ?? '',
        m.reactions?.length ?? 0,
      ].join('|'),
    )
    .join('\n')
}

/** Swap in latest message objects without rebuilding date pills or row order. */
export function hydrateChatListItems(
  items: ChatListItem[],
  messages: Message[],
): ChatListItem[] {
  if (items.length === 0) return items
  const byId = new Map(messages.map((m) => [m.id, m]))
  let changed = false
  const out: ChatListItem[] = new Array(items.length)
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    if (row.kind === 'date') {
      out[i] = row
      continue
    }
    const fresh = byId.get(row.message.id)
    if (!fresh || fresh === row.message) {
      out[i] = row
    } else {
      out[i] = { ...row, message: fresh }
      changed = true
    }
  }
  return changed ? out : items
}

function chatListItemStable(old: ChatListItem, row: ChatListItem): boolean {
  if (old.id !== row.id || old.kind !== row.kind) return false
  if (row.kind === 'date') {
    return (
      old.kind === 'date' &&
      old.label === row.label &&
      old.layoutHeight === row.layoutHeight
    )
  }
  return (
    old.kind === 'message' &&
    row.kind === 'message' &&
    old.layoutHeight === row.layoutHeight &&
    old.groupPosition === row.groupPosition &&
    old.showAvatar === row.showAvatar &&
    old.showTail === row.showTail &&
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
