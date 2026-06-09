import type { Message } from '@/types'
import type { ChatListItem } from '@/lib/chatListItems'

/** Fixed height for centered date separator rows. */
export const CHAT_DATE_ROW_HEIGHT = 52

/** Fallback when type is unknown. */
export const CHAT_DEFAULT_ROW_HEIGHT = 56

const ROW_MARGIN = 6
const META_ROW = 18
const REACTIONS_ROW = 22
const REPLY_QUOTE = 44
const TEXT_LINE = 19
const CHARS_PER_LINE = 34

/** Matches `chatMediaLayout` caps without importing RN `Dimensions` (testable in Node). */
const BUBBLE_MEDIA_MAX_WIDTH = 308
const BUBBLE_MEDIA_MAX_HEIGHT = 300
const BUBBLE_MEDIA_MIN_WIDTH = 96
const BUBBLE_MEDIA_MIN_HEIGHT = 72
const STICKER_BUBBLE_SIZE = 160

function estimateMediaBubbleHeight(
  pixelWidth: number,
  pixelHeight: number,
  sticker?: boolean,
): number {
  if (sticker) {
    const edge = Math.min(STICKER_BUBBLE_SIZE, BUBBLE_MEDIA_MAX_WIDTH)
    return edge
  }
  if (pixelWidth < 1 || pixelHeight < 1) {
    return Math.round(BUBBLE_MEDIA_MAX_WIDTH * 0.65)
  }
  const aspect = pixelWidth / pixelHeight
  let width = Math.min(pixelWidth, BUBBLE_MEDIA_MAX_WIDTH)
  let height = width / aspect
  if (height > BUBBLE_MEDIA_MAX_HEIGHT) {
    height = BUBBLE_MEDIA_MAX_HEIGHT
    width = BUBBLE_MEDIA_MAX_WIDTH
  } else if (width > BUBBLE_MEDIA_MAX_WIDTH) {
    width = BUBBLE_MEDIA_MAX_WIDTH
    height = width / aspect
  }
  width = Math.round(
    Math.max(BUBBLE_MEDIA_MIN_WIDTH, Math.min(BUBBLE_MEDIA_MAX_WIDTH, width)),
  )
  height = Math.round(
    Math.max(BUBBLE_MEDIA_MIN_HEIGHT, Math.min(BUBBLE_MEDIA_MAX_HEIGHT, height)),
  )
  return height
}

/** Estimate inverted-list row height so FlatList can skip on-layout measurement. */
export function estimateChatMessageRowHeight(message: Message): number {
  let h = 10 + META_ROW + ROW_MARGIN * 2

  if (message.replyTo && !message.deletedAt) h += REPLY_QUOTE
  if (message.reactions?.length) h += REACTIONS_ROW

  switch (message.type) {
    case 'image':
    case 'video':
    case 'sticker': {
      h += estimateMediaBubbleHeight(
        message.mediaWidth ?? 0,
        message.mediaHeight ?? 0,
        message.type === 'sticker',
      )
      if (message.body) {
        const lines = Math.min(4, Math.ceil(message.body.length / CHARS_PER_LINE))
        h += lines * TEXT_LINE
      }
      break
    }
    case 'audio':
      h += 52
      break
    case 'document':
      h += 68
      break
    case 'location':
      h += 168
      break
    case 'contacts':
    case 'interactive':
    case 'button':
      h += 80
      break
    default: {
      const body = message.deletedAt ? 'Message deleted' : (message.body ?? '')
      const lines = Math.max(1, Math.ceil(body.length / CHARS_PER_LINE))
      h += lines * TEXT_LINE + 8
    }
  }

  return Math.max(CHAT_DEFAULT_ROW_HEIGHT, Math.round(h))
}

export function layoutHeightForChatListItem(item: Omit<ChatListItem, 'layoutHeight'>): number {
  if (item.kind === 'date') return CHAT_DATE_ROW_HEIGHT
  return estimateChatMessageRowHeight(item.message)
}

export type ChatListLayoutEntry = { length: number; offset: number }

/** Cumulative offsets for FlatList `getItemLayout`. */
export function buildChatListLayouts(data: ChatListItem[]): ChatListLayoutEntry[] {
  let offset = 0
  return data.map((item) => {
    const length = item.layoutHeight
    const entry = { length, offset }
    offset += length
    return entry
  })
}
