import { useCallback, useEffect } from 'react'
import type { ConversationListItem, Message } from '@/types'
import type { InboxFilter } from '@/lib/inboxFilters'
import { getRawDb, runExclusiveDb as runExclusiveDbWrite } from './client'
import { clearLiveStores, useLiveStore } from './reactive'

const nowIso = () => new Date().toISOString()
const bool = (v: boolean | undefined | null) => (v ? 1 : 0)

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

const MESSAGE_COLUMNS = [
  'id',
  'conversation_id',
  'wa_message_id',
  'sent_by',
  'direction',
  'type',
  'body',
  'media_url',
  'media_thumb_url',
  'media_file_size',
  'thumbhash',
  'media_width',
  'media_height',
  'media_mime_type',
  'media_filename',
  'media_status',
  'status',
  'error_message',
  'reply_to_message_id',
  'deleted_at',
  'edited_at',
  'starred_at',
  'sent_at',
  'created_at',
  'local_preview_uri',
  'media_local_path',
  'seq',
  'payload',
] as const

function buildUpsertSql(
  table: string,
  columns: readonly string[],
  pk: string,
): string {
  const cols = columns.join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const updates = columns
    .filter((c) => c !== pk)
    .map((c) => `${c}=excluded.${c}`)
    .join(', ')
  return `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`
}

/** Preserve client-only media paths when server sync omits them. */
function buildMessageUpsertSql(): string {
  const cols = MESSAGE_COLUMNS.join(', ')
  const placeholders = MESSAGE_COLUMNS.map(() => '?').join(', ')
  const preserve = new Set(['local_preview_uri', 'media_local_path'])
  const updates = MESSAGE_COLUMNS.filter((c) => c !== 'id')
    .map((c) =>
      preserve.has(c)
        ? `${c}=COALESCE(excluded.${c}, messages.${c})`
        : `${c}=excluded.${c}`,
    )
    .join(', ')
  return `INSERT INTO messages (${cols}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`
}

const MESSAGE_UPSERT_SQL = buildMessageUpsertSql()

function messageValues(m: Message, seq?: number | null): (string | number | null)[] {
  return [
    m.id,
    m.conversationId,
    m.waMessageId ?? null,
    m.sentBy ?? null,
    m.direction,
    m.type,
    m.body ?? null,
    m.mediaUrl ?? null,
    m.mediaThumbUrl ?? null,
    m.mediaFileSize ?? null,
    m.thumbhash ?? null,
    m.mediaWidth ?? null,
    m.mediaHeight ?? null,
    m.mediaMimeType ?? null,
    m.mediaFilename ?? null,
    m.mediaStatus ?? null,
    m.status,
    m.errorMessage ?? null,
    m.replyToMessageId ?? null,
    m.deletedAt ?? null,
    m.editedAt ?? null,
    m.starredAt ?? null,
    m.sentAt,
    m.createdAt,
    m.localPreviewUri ?? null,
    m.localCacheUri ?? null,
    seq ?? null,
    JSON.stringify(m),
  ]
}

async function upsertMessagesInTx(
  db: ReturnType<typeof getRawDb>,
  rows: Message[],
  seq?: number | null,
): Promise<void> {
  for (const m of rows) {
    await db.runAsync(MESSAGE_UPSERT_SQL, messageValues(m, seq))
  }
}

/** Batched upsert of normalized messages (serialized — no nested transactions). */
export async function upsertMessages(rows: Message[], seq?: number | null): Promise<void> {
  if (rows.length === 0) return
  await runExclusiveDbWrite(async () => {
    await upsertMessagesInTx(getRawDb(), rows, seq)
  })
}

/* -------------------------------------------------------------------------- */
/*  Conversations                                                             */
/* -------------------------------------------------------------------------- */

const CONVERSATION_COLUMNS = [
  'id',
  'status',
  'assigned_to',
  'contact_name',
  'contact_wa_id',
  'last_message_at',
  'last_message_preview',
  'last_message_direction',
  'last_message_status',
  'last_message_type',
  'unread_count',
  'pinned_at',
  'ai_handled',
  'seq',
  'payload',
  'updated_at',
] as const

const CONVERSATION_UPSERT_SQL = buildUpsertSql('conversations', CONVERSATION_COLUMNS, 'id')

function conversationValues(
  c: ConversationListItem,
  seq?: number | null,
): (string | number | null)[] {
  return [
    c.id,
    c.status,
    c.assignedTo ?? null,
    c.contact?.name ?? null,
    c.contact?.waId ?? null,
    c.lastMessageAt ?? null,
    c.lastMessagePreview ?? null,
    c.lastMessageDirection ?? null,
    c.lastMessageStatus ?? null,
    c.lastMessageType ?? null,
    c.unreadCount ?? 0,
    c.pinnedAt ?? null,
    bool(c.aiHandled),
    seq ?? null,
    JSON.stringify(c),
    nowIso(),
  ]
}

async function upsertConversationsInTx(
  db: ReturnType<typeof getRawDb>,
  rows: ConversationListItem[],
  seq?: number | null,
): Promise<void> {
  for (const c of rows) {
    await db.runAsync(CONVERSATION_UPSERT_SQL, conversationValues(c, seq))
  }
}

/** Batched upsert of conversation list items (serialized). */
export async function upsertConversations(
  rows: ConversationListItem[],
  seq?: number | null,
): Promise<void> {
  if (rows.length === 0) return
  await runExclusiveDbWrite(async () => {
    await upsertConversationsInTx(getRawDb(), rows, seq)
  })
}

/** Max rows applied per exclusive block so reactive reads can interleave. */
const SYNC_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return arr.length ? [arr] : []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Apply a sync batch to the device DB. Upserts are chunked into bounded
 * exclusive blocks so a large change-feed pull cannot hold the single SQLite
 * connection for seconds (which starved live reads and the recorder thread).
 */
export async function applyChangeBatch(input: {
  messageUpserts: Message[]
  conversationUpserts: ConversationListItem[]
  messageDeletes: string[]
  conversationDeletes: string[]
}): Promise<void> {
  const { messageUpserts, conversationUpserts, messageDeletes, conversationDeletes } = input

  for (const rows of chunk(messageUpserts, SYNC_CHUNK)) {
    await runExclusiveDbWrite(() => upsertMessagesInTx(getRawDb(), rows))
  }
  for (const rows of chunk(conversationUpserts, SYNC_CHUNK)) {
    await runExclusiveDbWrite(() => upsertConversationsInTx(getRawDb(), rows))
  }
  if (messageDeletes.length) {
    await runExclusiveDbWrite(async () => {
      const db = getRawDb()
      const placeholders = messageDeletes.map(() => '?').join(',')
      await db.runAsync(`DELETE FROM messages WHERE id IN (${placeholders})`, messageDeletes)
    })
  }
  if (conversationDeletes.length) {
    await runExclusiveDbWrite(async () => {
      const db = getRawDb()
      const placeholders = conversationDeletes.map(() => '?').join(',')
      await db.runAsync(`DELETE FROM conversations WHERE id IN (${placeholders})`, conversationDeletes)
      await db.runAsync(
        `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
        conversationDeletes,
      )
    })
  }
}

export interface LocalMessageSearchHit {
  messageId: string
  conversationId: string
  body: string | null
  direction: 'inbound' | 'outbound'
  type: string
  sentAt: string
  contactName: string | null
  contactWaId: string
}

/** Substring search over local message bodies, joined to the contact label. */
export async function searchLocalMessages(
  q: string,
  limit = 50,
): Promise<LocalMessageSearchHit[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const db = getRawDb()
  const rows = await db.getAllAsync<{
    messageId: string
    conversationId: string
    body: string | null
    direction: string
    type: string
    sentAt: string
    contactName: string | null
    contactWaId: string | null
  }>(
    `SELECT m.id AS messageId, m.conversation_id AS conversationId, m.body AS body,
            m.direction AS direction, m.type AS type, m.sent_at AS sentAt,
            c.contact_name AS contactName, c.contact_wa_id AS contactWaId
       FROM messages m
       LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE m.deleted_at IS NULL AND m.body LIKE ?
      ORDER BY m.sent_at DESC
      LIMIT ?`,
    [`%${term}%`, limit],
  )
  return rows.map((r) => ({
    messageId: r.messageId,
    conversationId: r.conversationId,
    body: r.body,
    direction: r.direction === 'inbound' ? 'inbound' : 'outbound',
    type: r.type,
    sentAt: r.sentAt,
    contactName: r.contactName,
    contactWaId: r.contactWaId ?? '',
  }))
}

type MessageRow = {
  id: string
  payload: string
  local_preview_uri?: string | null
  media_local_path?: string | null
}

function parseMessagePayload(raw: string | null | undefined): Message | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Message
  } catch {
    return null
  }
}

/** Merge promoted SQLite columns into the JSON payload (client-only fields). */
function mergeMessageRow(row: MessageRow): Message | null {
  const parsed = parseMessageCached(row.id, row.payload)
  if (!parsed) return null
  const preview = row.local_preview_uri ?? parsed.localPreviewUri
  const cache = row.media_local_path ?? parsed.localCacheUri
  if (preview === parsed.localPreviewUri && cache === parsed.localCacheUri) return parsed
  return {
    ...parsed,
    ...(preview ? { localPreviewUri: preview } : {}),
    ...(cache ? { localCacheUri: cache } : {}),
  }
}

/** Read a single message's full payload from the device DB. */
export async function getMessageById(id: string): Promise<Message | null> {
  const db = getRawDb()
  const row = await db.getFirstAsync<MessageRow>(
    `SELECT id, payload, local_preview_uri, media_local_path FROM messages WHERE id = ?`,
    [id],
  )
  if (!row) return null
  return mergeMessageRow(row)
}

/**
 * Merge a partial update into a message's stored payload + promoted columns.
 * No-op if the message isn't present locally (e.g. patch raced ahead of insert).
 */
export async function patchLocalMessage(
  id: string,
  partial: Partial<Message>,
): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM messages WHERE id = ?',
      [id],
    )
    const existing = parseMessagePayload(row?.payload)
    if (!existing) return
    await upsertMessagesInTx(db, [{ ...existing, ...partial }])
  })
}

/** Upsert a single normalized message (optimistic or server-confirmed). */
export async function putLocalMessage(message: Message): Promise<void> {
  await upsertMessages([message])
}

/**
 * Swap an optimistic row for its server-confirmed version: insert the new row,
 * then drop the temporary id if it differs. Single transaction via two writes.
 */
export async function replaceLocalMessage(
  optimisticId: string,
  message: Message,
): Promise<void> {
  if (optimisticId && optimisticId !== message.id) {
    const { transferMessageMediaCache } = await import('@/lib/messageMediaCache')
    await transferMessageMediaCache(optimisticId, message.id)
  }
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    await upsertMessagesInTx(db, [message])
    if (optimisticId && optimisticId !== message.id) {
      await db.runAsync('DELETE FROM messages WHERE id = ?', [optimisticId])
    }
  })
}

function parseConversationPayload(raw: string | null | undefined): ConversationListItem | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ConversationListItem
  } catch {
    return null
  }
}

/** Read a single conversation's full payload from the device DB. */
export async function getConversationById(
  id: string,
): Promise<ConversationListItem | null> {
  const db = getRawDb()
  const row = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM conversations WHERE id = ?',
    [id],
  )
  return parseConversationPayload(row?.payload)
}

/** Merge a partial update into a conversation's stored payload + columns. */
export async function patchLocalConversation(
  id: string,
  partial: Partial<ConversationListItem>,
): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM conversations WHERE id = ?',
      [id],
    )
    const existing = parseConversationPayload(row?.payload)
    if (!existing) return
    await upsertConversationsInTx(db, [{ ...existing, ...partial }])
  })
}

/** Optimistically reflect a just-sent/received message onto its conversation row. */
export async function applyMessageToConversation(message: Message): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM conversations WHERE id = ?',
      [message.conversationId],
    )
    const conv = parseConversationPayload(row?.payload)
    if (!conv) return
    await upsertConversationsInTx(db, [
      {
        ...conv,
        lastMessageAt: message.sentAt,
        lastMessageId: message.id,
        lastMessagePreview: message.body ?? conv.lastMessagePreview,
        lastMessageDirection: message.direction,
        lastMessageStatus: message.status,
        lastMessageType: message.type,
      },
    ])
  })
}

/** Single write for optimistic outbound sends — message row + inbox preview together. */
export async function putOptimisticOutboundMessage(message: Message): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    await upsertMessagesInTx(db, [message])
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM conversations WHERE id = ?',
      [message.conversationId],
    )
    const conv = parseConversationPayload(row?.payload)
    if (!conv) return
    await upsertConversationsInTx(db, [
      {
        ...conv,
        lastMessageAt: message.sentAt,
        lastMessageId: message.id,
        lastMessagePreview: message.body ?? conv.lastMessagePreview,
        lastMessageDirection: message.direction,
        lastMessageStatus: message.status,
        lastMessageType: message.type,
      },
    ])
  })
}

/** Hard-delete messages by id (tombstones already arrive as upserts with deletedAt). */
export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    const placeholders = ids.map(() => '?').join(',')
    await db.runAsync(`DELETE FROM messages WHERE id IN (${placeholders})`, ids)
  })
}

/** Remove conversations (and their messages) from the device. */
export async function deleteConversations(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    const placeholders = ids.map(() => '?').join(',')
    await db.runAsync(`DELETE FROM conversations WHERE id IN (${placeholders})`, ids)
    await db.runAsync(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`, ids)
  })
}

/** Wipe every table on the device (logout) so the next agent starts clean. */
export async function clearAllLocalData(): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    await db.runAsync('DELETE FROM messages')
    await db.runAsync('DELETE FROM conversations')
    await db.runAsync('DELETE FROM media_blobs')
    await db.runAsync('DELETE FROM outbox')
    await db.runAsync('DELETE FROM sync_state')
  })
  messageParseCache.clear()
  conversationParseCache.clear()
  threadResultCache.clear()
  inboxResultCache.clear()
  starredResultCache.current = undefined
  clearLiveStores()
}

/* -------------------------------------------------------------------------- */
/*  Sync-state key/value                                                      */
/* -------------------------------------------------------------------------- */

export async function getSyncValue(key: string): Promise<string | null> {
  const db = getRawDb()
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM sync_state WHERE key = ?',
    [key],
  )
  return row?.value ?? null
}

export async function setSyncValue(key: string, value: string): Promise<void> {
  await runExclusiveDbWrite(async () => {
    const db = getRawDb()
    await db.runAsync(
      `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()],
    )
  })
}

/* -------------------------------------------------------------------------- */
/*  Reactive reads (custom store: single change listener, serialized reads)   */
/* -------------------------------------------------------------------------- */

const EMPTY_MESSAGES: Message[] = []
const EMPTY_CONVERSATIONS: ConversationListItem[] = []

/** Default window of most-recent messages loaded for a freshly opened thread. */
export const THREAD_PAGE_SIZE = 60

/**
 * Parsed-payload caches keyed by row id. Avoids re-running JSON.parse for rows
 * whose payload text is unchanged between reads (the dominant cost when a sync
 * batch fires a change notification for a large thread/inbox).
 */
const messageParseCache = new Map<string, { raw: string; parsed: Message }>()
const conversationParseCache = new Map<string, { raw: string; parsed: ConversationListItem }>()
const PARSE_CACHE_CAP = 6000

function parseMessageCached(id: string, raw: string): Message | null {
  const hit = messageParseCache.get(id)
  if (hit && hit.raw === raw) return hit.parsed
  let parsed: Message
  try {
    parsed = JSON.parse(raw) as Message
  } catch {
    // Corrupt/truncated payload must never crash a live read (blank screen).
    return null
  }
  if (messageParseCache.size > PARSE_CACHE_CAP) messageParseCache.clear()
  messageParseCache.set(id, { raw, parsed })
  return parsed
}

function parseConversationCached(id: string, raw: string): ConversationListItem | null {
  const hit = conversationParseCache.get(id)
  if (hit && hit.raw === raw) return hit.parsed
  let parsed: ConversationListItem
  try {
    parsed = JSON.parse(raw) as ConversationListItem
  } catch {
    return null
  }
  if (conversationParseCache.size > PARSE_CACHE_CAP) conversationParseCache.clear()
  conversationParseCache.set(id, { raw, parsed })
  return parsed
}

/** Reuse the previous array ref when every element is identical (skip re-render). */
function reuseArrayRef<T>(prev: T[] | undefined, next: T[]): T[] {
  if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return prev
  return next
}

/** Evict the oldest entries (insertion order) once a result cache exceeds its cap. */
function capMap<K, V>(map: Map<K, V>, cap: number): void {
  if (map.size <= cap) return
  for (const key of map.keys()) {
    if (map.size <= cap) break
    map.delete(key)
  }
}

const THREAD_CACHE_CAP = 60
const INBOX_CACHE_CAP = 24

const threadResultCache = new Map<string, Message[]>()

async function readThreadMessages(conversationId: string, limit: number): Promise<Message[]> {
  const db = getRawDb()
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT id, payload, local_preview_uri, media_local_path FROM messages
       WHERE conversation_id = ? AND deleted_at IS NULL
       ORDER BY sent_at DESC, created_at DESC
       LIMIT ?`,
    [conversationId, limit],
  )
  // rows are newest-first; reverse into oldest→newest for the chat view.
  const out: Message[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[rows.length - 1 - i]
    const parsed = mergeMessageRow(r)
    if (parsed) out.push(parsed)
  }
  const stable = reuseArrayRef(threadResultCache.get(conversationId), out)
  threadResultCache.set(conversationId, stable)
  capMap(threadResultCache, THREAD_CACHE_CAP)
  return stable
}

const inboxResultCache = new Map<string, ConversationListItem[]>()

async function readInbox(
  cacheKey: string,
  filter: InboxFilter,
  term: string,
  agentId: string | null,
): Promise<ConversationListItem[]> {
  const db = getRawDb()
  const conditions: string[] = []
  const params: (string | number | null)[] = []

  if (filter === 'mine') {
    if (agentId) {
      conditions.push('assigned_to = ?')
      params.push(agentId)
    }
  } else if (filter === 'open' || filter === 'resolved') {
    conditions.push('status = ?')
    params.push(filter)
  }

  if (term.length > 0) {
    const like = `%${term}%`
    conditions.push('(contact_name LIKE ? OR contact_wa_id LIKE ? OR last_message_preview LIKE ?)')
    params.push(like, like, like)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM conversations
       ${where}
       ORDER BY pinned_at DESC, last_message_at DESC`,
    params,
  )
  const out: ConversationListItem[] = []
  for (const r of rows) {
    const parsed = parseConversationCached(r.id, r.payload)
    if (parsed) out.push(parsed)
  }
  const stable = reuseArrayRef(inboxResultCache.get(cacheKey), out)
  inboxResultCache.set(cacheKey, stable)
  capMap(inboxResultCache, INBOX_CACHE_CAP)
  return stable
}

const starredResultCache = { current: undefined as Message[] | undefined }

async function readStarredMessages(): Promise<Message[]> {
  const db = getRawDb()
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT id, payload, local_preview_uri, media_local_path FROM messages
       WHERE starred_at IS NOT NULL
       ORDER BY starred_at DESC`,
  )
  const out: Message[] = []
  for (const r of rows) {
    const parsed = mergeMessageRow(r)
    if (parsed) out.push(parsed)
  }
  const stable = reuseArrayRef(starredResultCache.current, out)
  starredResultCache.current = stable
  return stable
}

/**
 * Oldest→newest non-deleted messages for a chat thread, windowed to the most
 * recent `limit` rows. Reopening renders the cached snapshot synchronously.
 */
export function useThreadMessages(conversationId: string, limit: number = THREAD_PAGE_SIZE) {
  const reader = useCallback(
    () => readThreadMessages(conversationId, limit),
    [conversationId, limit],
  )
  const live = useLiveStore(`thread:${conversationId}`, ['messages'], reader, EMPTY_MESSAGES)
  const { refresh } = live
  useEffect(() => {
    refresh()
  }, [limit, refresh])
  return { messages: live.data, status: live.status, error: live.error }
}

/**
 * Inbox list: pinned first, then most recent activity. Filters + search run in
 * SQL against promoted columns so reads never parse JSON to filter.
 */
export function useInboxConversations(
  filter: InboxFilter = 'all',
  search = '',
  agentId: string | null = null,
) {
  const term = search.trim()
  const key = `inbox:${filter}:${term}:${agentId ?? ''}`
  const reader = useCallback(
    () => readInbox(key, filter, term, agentId),
    [key, filter, term, agentId],
  )
  const live = useLiveStore(key, ['conversations'], reader, EMPTY_CONVERSATIONS)
  return { conversations: live.data, status: live.status, error: live.error }
}

/** Starred messages across all conversations, newest first. */
export function useStarredMessages() {
  const reader = useCallback(() => readStarredMessages(), [])
  const live = useLiveStore('starred', ['messages'], reader, EMPTY_MESSAGES)
  return { messages: live.data, status: live.status, error: live.error }
}

