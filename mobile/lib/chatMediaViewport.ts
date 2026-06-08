import { isHeavyMediaType, isStickerType } from '@/lib/messageMediaKind'
import type { ChatListItem } from '@/lib/chatListItems'
import type { Message } from '@/types'
import type { ViewToken } from 'react-native'

export const MEDIA_PREFETCH_ROWS = 2

export type ChatMediaViewport = {
  loadMessageIds: string[]
  orderedMedia: Message[]
  presignCandidates: Array<{
    key: string
    messageId: string
    type: Message['type']
    direction: Message['direction']
  }>
}

function messageRowAt(data: ChatListItem[], index: number): Message | null {
  const row = data[index]
  return row?.kind === 'message' ? row.message : null
}

/** Visible rows + small prefetch band (viewport order, WhatsApp-style). */
export function buildChatMediaViewport(
  data: ChatListItem[],
  viewableItems: ViewToken[],
): ChatMediaViewport {
  const indices = viewableItems
    .map((t) => t.index)
    .filter((i): i is number => i != null)

  if (indices.length === 0) {
    return { loadMessageIds: [], orderedMedia: [], presignCandidates: [] }
  }

  const min = Math.min(...indices)
  const max = Math.max(...indices)
  const from = Math.max(0, min - MEDIA_PREFETCH_ROWS)
  const to = Math.min(data.length - 1, max + MEDIA_PREFETCH_ROWS)

  const loadMessageIds: string[] = []
  const orderedMedia: Message[] = []
  const presignCandidates: ChatMediaViewport['presignCandidates'] = []
  const seen = new Set<string>()

  for (let i = from; i <= to; i++) {
    const msg = messageRowAt(data, i)
    if (!msg || seen.has(msg.id)) continue
    seen.add(msg.id)
    loadMessageIds.push(msg.id)

    if (isHeavyMediaType(msg.type) || isStickerType(msg.type)) {
      orderedMedia.push(msg)
    }

    if (msg.mediaUrl && msg.mediaStatus !== 'pending' && msg.type !== 'text' && msg.type !== 'location') {
      presignCandidates.push({
        key: msg.mediaUrl,
        messageId: msg.id,
        type: msg.type,
        direction: msg.direction,
      })
    }
  }

  return { loadMessageIds, orderedMedia, presignCandidates }
}
