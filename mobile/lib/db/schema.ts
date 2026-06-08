import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * On-device source of truth (expo-sqlite + Drizzle live queries).
 *
 * Design: the columns we sort, filter, or render in hot list paths are typed
 * first-class columns so live queries never parse JSON. Everything else
 * (reactions, reply preview, messaging-window flags, referral metadata) lives
 * in a `payload` JSON blob to avoid a column explosion while keeping full
 * fidelity. Timestamps are stored as ISO-8601 UTC text — lexicographically
 * sortable and identical to the server wire format.
 *
 * IMPORTANT: keep `lib/db/migrations.ts` DDL in sync with these definitions.
 */

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull(),
    assignedTo: text('assigned_to'),
    contactName: text('contact_name'),
    contactWaId: text('contact_wa_id'),
    lastMessageAt: text('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    lastMessageDirection: text('last_message_direction'),
    lastMessageStatus: text('last_message_status'),
    lastMessageType: text('last_message_type'),
    unreadCount: integer('unread_count').notNull().default(0),
    pinnedAt: text('pinned_at'),
    aiHandled: integer('ai_handled', { mode: 'boolean' }).notNull().default(false),
    /** Server change-feed cursor for ordering/conflict resolution (nullable until synced). */
    seq: integer('seq'),
    /** Full ConversationListItem/Detail JSON for fields not promoted to columns. */
    payload: text('payload', { mode: 'json' }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    // Inbox ordering: pinned first, then most-recent activity.
    byPinned: index('idx_conversations_pinned').on(t.pinnedAt),
    byLastMessageAt: index('idx_conversations_last_message_at').on(t.lastMessageAt),
    byContact: index('idx_conversations_contact').on(t.contactName, t.contactWaId),
    byStatus: index('idx_conversations_status').on(t.status),
  }),
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    waMessageId: text('wa_message_id'),
    sentBy: text('sent_by'),
    direction: text('direction').notNull(),
    type: text('type').notNull(),
    body: text('body'),
    mediaUrl: text('media_url'),
    mediaThumbUrl: text('media_thumb_url'),
    mediaFileSize: integer('media_file_size'),
    thumbhash: text('thumbhash'),
    mediaWidth: integer('media_width'),
    mediaHeight: integer('media_height'),
    mediaMimeType: text('media_mime_type'),
    mediaFilename: text('media_filename'),
    mediaStatus: text('media_status'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    replyToMessageId: text('reply_to_message_id'),
    deletedAt: text('deleted_at'),
    editedAt: text('edited_at'),
    starredAt: text('starred_at'),
    sentAt: text('sent_at').notNull(),
    createdAt: text('created_at').notNull(),
    /** Optimistic local file path shown before the upload/download resolves. */
    localPreviewUri: text('local_preview_uri'),
    /** Server change-feed cursor; null for not-yet-synced optimistic rows. */
    seq: integer('seq'),
    /** Full Message JSON (reactions, replyTo, metadata) for fields not promoted. */
    payload: text('payload', { mode: 'json' }).notNull(),
  },
  (t) => ({
    // Chat thread: oldest→newest within a conversation.
    byConversation: index('idx_messages_conversation').on(t.conversationId, t.sentAt),
    byStarred: index('idx_messages_starred').on(t.starredAt),
    byWaMessageId: index('idx_messages_wa_message_id').on(t.waMessageId),
  }),
)

/**
 * Content-addressed media mirror — one row per stored object. Unifies the media
 * cache and dedup on device: the same bytes resolve to one local file and one
 * ThumbHash no matter how many messages reference them.
 */
export const mediaBlobs = sqliteTable('media_blobs', {
  storageKey: text('storage_key').primaryKey(),
  sha256: text('sha256'),
  thumbhash: text('thumbhash'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  /** Absolute path of the cached file on device, if downloaded. */
  localUri: text('local_uri'),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Outbox of local mutations awaiting confirmation from the server. Drives the
 * push side of the sync engine and survives restarts/offline.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    conversationId: text('conversation_id'),
    payload: text('payload', { mode: 'json' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    nextAttemptAt: text('next_attempt_at'),
  },
  (t) => ({
    byNextAttempt: index('idx_outbox_next_attempt').on(t.nextAttemptAt),
  }),
)

/** Simple key/value for sync cursors and engine bookkeeping. */
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
})

export type ConversationRow = typeof conversations.$inferSelect
export type NewConversationRow = typeof conversations.$inferInsert
export type MessageRow = typeof messages.$inferSelect
export type NewMessageRow = typeof messages.$inferInsert
export type MediaBlobRow = typeof mediaBlobs.$inferSelect
export type NewMediaBlobRow = typeof mediaBlobs.$inferInsert
export type OutboxRow = typeof outbox.$inferSelect
export type NewOutboxRow = typeof outbox.$inferInsert
