import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { normalizeConversation } from '@/lib/conversation'
import type { ConversationListItem, ConversationsResponse, Message } from '@/types'

export type InboxPatchResult = {
  data: InfiniteData<ConversationsResponse> | undefined
  found: boolean
}

function messagePreview(message: Message): string {
  if (message.type === 'text') return (message.body ?? '').slice(0, 120)
  return `[${message.type}]`
}

/** Move conversation to top and update last-message preview (socket + optimistic sends). */
export function patchInboxForNewMessage(
  old: InfiniteData<ConversationsResponse> | undefined,
  conversationId: string,
  message: Message,
  options?: {
    suppressUnread?: boolean
    messaging?: Partial<ConversationListItem>
  },
): InboxPatchResult {
  if (!old) return { data: old, found: false }

  const suppressUnread = options?.suppressUnread ?? false
  const messaging = options?.messaging

  let updated: ConversationListItem | undefined
  const pages = old.pages.map((page, pageIndex) => {
    const rest = page.conversations.filter((c) => {
      if (c.id !== conversationId) return true
      const bumpUnread = message.direction === 'inbound' && !suppressUnread
      updated = normalizeConversation({
        ...c,
        lastMessageAt: message.sentAt,
        lastMessagePreview: messagePreview(message),
        lastMessageId: message.id,
        lastMessageDirection: message.direction,
        lastMessageStatus: message.status,
        lastMessageType: message.type,
        unreadCount: bumpUnread ? c.unreadCount + 1 : c.unreadCount,
        ...(messaging ?? {}),
      })
      return false
    })
    if (!updated) return page
    if (pageIndex === 0) {
      return { ...page, conversations: [updated, ...rest] }
    }
    return { ...page, conversations: rest }
  })

  return {
    data: updated ? { ...old, pages } : old,
    found: !!updated,
  }
}

export function patchInboxQueriesForMessage(
  qc: QueryClient,
  conversationId: string,
  message: Message,
  options?: { suppressUnread?: boolean },
) {
  let found = false
  qc.setQueriesData<InfiniteData<ConversationsResponse>>(
    { queryKey: ['conversations'] },
    (old) => {
      const result = patchInboxForNewMessage(old, conversationId, message, options)
      found = found || result.found
      return result.data
    },
  )
  if (!found) {
    void qc.invalidateQueries({ queryKey: ['conversations'] })
  }
}
