import { api } from '@/services/api'
import { ensureDbReady } from '@/lib/db/client'
import { upsertConversations, upsertMessages } from '@/lib/db/repo'
import { normalizeConversation } from '@/lib/conversation'
import { normalizeMessagesResponse } from '@/lib/normalizeMessage'
import type { InboxFilter } from '@/lib/inboxFilters'
import type {
  ConversationsResponse,
  Message,
  MessagesResponse,
} from '@/types'

function filterParams(filter: InboxFilter, search: string): Record<string, string> {
  const params: Record<string, string> = {}
  if (filter === 'mine') params.assignedTo = 'me'
  else if (filter !== 'all') params.status = filter
  if (search) params.search = search
  return params
}

/**
 * Fetch a page of conversations from the server and persist into the device DB.
 * Returns the next cursor (null when the list is exhausted).
 */
export async function fetchConversationsPage(
  filter: InboxFilter,
  search: string,
  cursor: string | null,
): Promise<string | null> {
  await ensureDbReady()
  const params = filterParams(filter, search)
  if (cursor) params.cursor = cursor
  const res = await api.get<ConversationsResponse>('/conversations', { params })
  const conversations = res.data.conversations.map((c) => normalizeConversation(c))
  await upsertConversations(conversations)
  return res.data.nextCursor ?? null
}

/** Seed the initial inbox snapshot (first page) into the device DB. */
export async function seedConversations(): Promise<void> {
  await fetchConversationsPage('all', '', null)
}

/**
 * Fetch a page of a thread's messages and persist them. `before` pages older
 * history. Returns the next (older) cursor.
 */
export async function fetchThreadPage(
  conversationId: string,
  before?: string | null,
): Promise<{ messages: Message[]; nextCursor: string | null }> {
  await ensureDbReady()
  const res = await api.get<MessagesResponse>(
    `/conversations/${conversationId}/messages`,
    { params: before ? { before } : {} },
  )
  const normalized = normalizeMessagesResponse(
    res.data as {
      messages: (Message & Record<string, unknown>)[]
      nextCursor: string | null
    },
  )
  await upsertMessages(normalized.messages)
  return normalized
}
