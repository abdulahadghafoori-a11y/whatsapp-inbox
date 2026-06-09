import type { ChatListItem, MessageGroupPosition } from '@/lib/chatListItems'

function sameSenderGroup(a: ChatListItem, b: ChatListItem): boolean {
  if (a.kind !== 'message' || b.kind !== 'message') return false
  if (a.message.deletedAt || b.message.deletedAt) return false
  if (a.message.direction !== b.message.direction) return false
  if (a.message.direction === 'outbound') return true
  return a.message.sentBy === b.message.sentBy
}

/** Assign grouping metadata for consecutive same-sender bubbles (Stream-style). */
export function enrichChatListWithGroups(items: ChatListItem[]): ChatListItem[] {
  return items.map((row, i) => {
    if (row.kind !== 'message') return row

    const newer = items[i - 1]
    const older = items[i + 1]
    // Inverted list: lower index = newer message (bottom of screen).
    const groupedWithNewer = newer ? sameSenderGroup(row, newer) : false
    const groupedWithOlder = older ? sameSenderGroup(row, older) : false
    const isNewestInGroup = !groupedWithNewer
    const isOldestInGroup = !groupedWithOlder

    let groupPosition: MessageGroupPosition = 'single'
    if (groupedWithNewer && groupedWithOlder) groupPosition = 'middle'
    else if (isNewestInGroup && groupedWithOlder) groupPosition = 'first'
    else if (isOldestInGroup && groupedWithNewer) groupPosition = 'last'

    const inbound = row.message.direction === 'inbound'
    const showAvatar = inbound && isNewestInGroup
    const showTail = isOldestInGroup

    return {
      ...row,
      groupPosition,
      showAvatar,
      showTail,
    }
  })
}
