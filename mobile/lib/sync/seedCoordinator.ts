import type { InboxFilter } from '@/lib/inboxFilters'
import type { Message } from '@/types'
import { fetchConversationsPage, fetchThreadPage } from './seed'

const inboxInflight = new Map<string, Promise<string | null>>()

/** Dedupe concurrent inbox page fetches (filter/search/cursor key). */
export function loadInboxPage(
  filter: InboxFilter,
  search: string,
  cursor: string | null,
): Promise<string | null> {
  const key = `${filter}\0${search}\0${cursor ?? ''}`
  const existing = inboxInflight.get(key)
  if (existing) return existing
  const task = fetchConversationsPage(filter, search, cursor).finally(() => {
    inboxInflight.delete(key)
  })
  inboxInflight.set(key, task)
  return task
}

const threadInflight = new Map<string, Promise<{ messages: Message[]; nextCursor: string | null }>>()

/**
 * Dedupe concurrent thread page loads by (conversation, cursor). No longer
 * globally serialized: writes are serialized by `runExclusiveDb`, so opening a
 * chat never has to wait behind an unrelated conversation's seed/sync.
 */
export function loadThreadPage(
  conversationId: string,
  before?: string | null,
): Promise<{ messages: Message[]; nextCursor: string | null }> {
  const key = `${conversationId}\0${before ?? ''}`
  const existing = threadInflight.get(key)
  if (existing) return existing
  const task = fetchThreadPage(conversationId, before).finally(() => {
    threadInflight.delete(key)
  })
  threadInflight.set(key, task)
  return task
}
