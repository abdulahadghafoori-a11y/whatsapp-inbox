import type { ConversationListItem, Message } from '@/types'

export type SyncChange =
  | { entity: 'message'; op: 'upsert'; seq: number; data: Message & Record<string, unknown> }
  | {
      entity: 'conversation'
      op: 'upsert'
      seq: number
      data: ConversationListItem & Record<string, unknown>
    }
  | { entity: 'message' | 'conversation'; op: 'delete'; seq: number; id: string }

export interface SyncResponse {
  changes: SyncChange[]
  cursor: number
  hasMore: boolean
}

export const SYNC_CURSOR_KEY = 'change_feed_cursor'
