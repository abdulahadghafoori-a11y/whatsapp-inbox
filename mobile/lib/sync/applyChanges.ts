import type { ConversationListItem, Message } from '@/types'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { applyChangeBatch } from '@/lib/db/repo'
import type { SyncChange } from './types'

/**
 * Apply a batch of change-feed entries to the device SQLite source of truth.
 * Grouped by kind so each kind is a single batched transaction.
 */
export async function applyChanges(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return

  const messageUpserts: Message[] = []
  const conversationUpserts: ConversationListItem[] = []
  const messageDeletes: string[] = []
  const conversationDeletes: string[] = []

  for (const change of changes) {
    if (change.entity === 'message') {
      if (change.op === 'upsert') messageUpserts.push(normalizeMessage(change.data))
      else messageDeletes.push(change.id)
    } else {
      if (change.op === 'upsert') conversationUpserts.push(change.data)
      else conversationDeletes.push(change.id)
    }
  }

  await applyChangeBatch({
    messageUpserts,
    conversationUpserts,
    messageDeletes,
    conversationDeletes,
  })
}
