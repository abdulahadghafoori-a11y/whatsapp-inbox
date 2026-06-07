import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { messageRenderEqual } from '@/lib/messageRenderEqual'
import { mergeMessageStatus, normalizeMessageStatus } from '@/lib/messageStatus'
import type { Message, MessageStatus, MessagesResponse } from '@/types'

function isOptimisticMediaId(id: string): boolean {
  return id.startsWith('pending-media-')
}

function isConfirmedOutboundMedia(message: Message): boolean {
  return (
    message.direction === 'outbound' &&
    message.type !== 'text' &&
    message.type !== 'location' &&
    !isOptimisticMediaId(message.id)
  )
}

/** Match socket/API message to the in-flight optimistic bubble (same send). */
function findOptimisticMediaReplaceId(
  messages: Message[],
  incoming: Message,
): string | null {
  const candidates = messages.filter(
    (m) =>
      isOptimisticMediaId(m.id) &&
      m.conversationId === incoming.conversationId &&
      m.type === incoming.type &&
      m.status === 'pending' &&
      (m.body ?? '') === (incoming.body ?? '') &&
      (m.replyToMessageId ?? null) === (incoming.replyToMessageId ?? null),
  )
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].id

  const inTime = new Date(incoming.sentAt).getTime()
  let best = candidates[0]
  let bestDelta = Math.abs(new Date(best.sentAt).getTime() - inTime)
  for (const c of candidates.slice(1)) {
    const delta = Math.abs(new Date(c.sentAt).getTime() - inTime)
    if (delta < bestDelta) {
      best = c
      bestDelta = delta
    }
  }
  return best.id
}

function previewFromMessage(m: Message | undefined): string | undefined {
  if (!m) return undefined
  if (m.localPreviewUri) return m.localPreviewUri
  const meta = m.metadata
  if (meta && typeof meta === 'object') {
    const cs = (meta as Record<string, unknown>).clientSend
    if (cs && typeof cs === 'object') {
      const prepared = (cs as Record<string, unknown>).preparedUri
      if (typeof prepared === 'string' && prepared.length > 0) return prepared
    }
  }
  return undefined
}

export type MessagesInfinite = InfiniteData<MessagesResponse>

/**
 * Was: persisted cache used flat useQuery shape — useInfiniteQuery needs { pages, pageParams }.
 */
export function coerceMessagesInfiniteData(data: unknown): MessagesInfinite | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  if (Array.isArray(d.pages)) {
    const pages = d.pages as MessagesResponse[]
    return {
      pages: pages.map((p) => ({
        messages: Array.isArray(p?.messages) ? p.messages : [],
        nextCursor: p?.nextCursor ?? null,
      })),
      pageParams: Array.isArray(d.pageParams) ? (d.pageParams as (string | null)[]) : pages.map(() => null),
    }
  }
  if (Array.isArray(d.messages)) {
    return {
      pages: [
        {
          messages: d.messages as MessagesResponse['messages'],
          nextCursor: (d.nextCursor as string | null) ?? null,
        },
      ],
      pageParams: [null],
    }
  }
  return undefined
}

/** Stable chronological order (oldest → newest), matching WhatsApp. */
export function compareMessagesChronological(a: Message, b: Message): number {
  const ta = new Date(a.sentAt).getTime()
  const tb = new Date(b.sentAt).getTime()
  if (ta !== tb) return ta - tb
  const ca = new Date(a.createdAt).getTime()
  const cb = new Date(b.createdAt).getTime()
  if (ca !== cb) return ca - cb
  return a.id.localeCompare(b.id)
}

export function sortMessagesChronological(messages: Message[]): Message[] {
  return [...messages].sort(compareMessagesChronological)
}

export function pageMessages(page: MessagesResponse | undefined): Message[] {
  return Array.isArray(page?.messages) ? page.messages : []
}

/**
 * Flatten infinite message pages oldest → newest.
 * Pages are stored [newest window, older window, …] from useInfiniteQuery; concat in
 * fetch order would put recent messages before older history (wrong). Reverse pages
 * first, then flatten each page (already oldest-first within the window).
 */
export function flattenMessagesPages(data: MessagesInfinite | undefined): Message[] {
  if (!data?.pages.length) return []
  const merged = [...data.pages].reverse().flatMap((p) => pageMessages(p))
  return sortMessagesChronological(merged)
}

/** Keep the same messages array reference when flatten order and render fields are unchanged. */
export function stabilizeMessageList(prev: Message[], next: Message[]): Message[] {
  if (prev === next) return prev
  if (prev.length !== next.length) return next
  let stable = true
  const merged: Message[] = new Array(next.length)
  for (let i = 0; i < next.length; i++) {
    const old = prev[i]
    const row = next[i]
    if (old && old.id === row.id && messageRenderEqual(old, row)) {
      merged[i] = old
    } else {
      merged[i] = row
      stable = false
    }
  }
  return stable ? prev : merged
}

export function patchMessageStatusInfinite(
  old: MessagesInfinite | undefined,
  messageId: string,
  status: MessageStatus,
  extra?: Partial<Message>,
): MessagesInfinite | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => {
      const patched = patchMessageStatusFlat(page, messageId, status, extra)
      return patched ?? page
    }),
  }
}

function patchMessageStatusFlat(
  old: MessagesResponse,
  messageId: string,
  status: MessageStatus,
  extra?: Partial<Message>,
): MessagesResponse | undefined {
  let changed = false
  const messages = pageMessages(old).map((m) => {
    if (m.id !== messageId) return m
    changed = true
    const now = new Date().toISOString()
    return {
      ...m,
      status,
      errorMessage: null,
      ...(status === 'pending' ? { sentAt: now, createdAt: m.createdAt ?? now } : {}),
      ...extra,
    }
  })
  return changed ? { ...old, messages } : undefined
}

export function upsertMessageInfinite(
  old: MessagesInfinite | undefined,
  message: Message,
  opts?: { removeId?: string; localPreviewUri?: string },
): MessagesInfinite {
  let localPreviewUri = opts?.localPreviewUri
  const enriched: Message = {
    ...message,
    type: message.type ?? 'text',
    localPreviewUri: localPreviewUri ?? message.localPreviewUri,
  }

  if (!old?.pages.length) {
    return {
      pageParams: [null],
      pages: [
        {
          messages: [
            {
              ...enriched,
              localPreviewUri: localPreviewUri ?? enriched.localPreviewUri,
            },
          ],
          nextCursor: null,
        },
      ],
    }
  }

  const pages = [...old.pages]
  const first = pages[0] ?? { messages: [], nextCursor: null }
  let messages = pageMessages(first)

  const explicitRemove = opts?.removeId
  let autoRemove: string | null = null
  if (isConfirmedOutboundMedia(enriched)) {
    autoRemove = findOptimisticMediaReplaceId(messages, enriched)
    if (autoRemove && !localPreviewUri) {
      const optimistic = messages.find((m) => m.id === autoRemove)
      localPreviewUri = previewFromMessage(optimistic)
    }
  }

  const removeIds = new Set(
    [explicitRemove, autoRemove].filter((id): id is string => !!id),
  )
  messages = messages.filter((m) => !removeIds.has(m.id))

  const merged: Message = {
    ...enriched,
    localPreviewUri: localPreviewUri ?? enriched.localPreviewUri,
  }

  const idx = messages.findIndex((m) => m.id === merged.id)
  if (idx >= 0) {
    const next = [...messages]
    next[idx] = {
      ...next[idx],
      ...merged,
      localPreviewUri: merged.localPreviewUri ?? next[idx].localPreviewUri ?? undefined,
    }
    messages = sortMessagesChronological(next)
  } else {
    messages = sortMessagesChronological([...messages, merged])
  }
  pages[0] = { ...first, messages }
  return { ...old, pages }
}

export function removeMessageInfinite(
  old: MessagesInfinite | undefined,
  messageId: string,
): MessagesInfinite | undefined {
  if (!old) return old
  let anyChanged = false
  const pages = old.pages.map((page) => {
    const prev = pageMessages(page)
    const messages = prev.filter((m) => m.id !== messageId)
    if (messages.length !== prev.length) anyChanged = true
    return messages.length !== prev.length ? { ...page, messages } : page
  })
  return anyChanged ? { ...old, pages } : old
}

export function patchMessagesStatusInfinite(
  old: MessagesInfinite | undefined,
  payload: {
    messageId?: string
    waMessageId?: string
    status: string
    errorMessage?: string | null
  },
): MessagesInfinite | undefined {
  if (!old) return old
  const normalized = normalizeMessageStatus(payload.status)
  if (!normalized) return old
  const terminal =
    normalized === 'sent' ||
    normalized === 'delivered' ||
    normalized === 'read' ||
    normalized === 'played' ||
    normalized === 'failed'
  let anyChanged = false
  const pages = old.pages.map((page) => {
    let changed = false
    const messages = pageMessages(page).map((m) => {
      if (m.direction !== 'outbound') return m
      const idMatch = payload.messageId != null && m.id === payload.messageId
      const waMatch = payload.waMessageId != null && m.waMessageId === payload.waMessageId
      if (!idMatch && !waMatch) return m
      const next = mergeMessageStatus(m.status, normalized)
      if (next === m.status && !terminal && payload.errorMessage == null) return m
      changed = true
      return {
        ...m,
        status: next,
        ...(terminal ? { sendPhase: undefined } : {}),
        ...(payload.errorMessage != null ? { errorMessage: payload.errorMessage } : {}),
        ...(normalized === 'pending' ? { errorMessage: null } : {}),
      }
    })
    if (changed) anyChanged = true
    return changed ? { ...page, messages } : page
  })
  return anyChanged ? { ...old, pages } : old
}

export function patchMessageFieldsInfinite(
  old: MessagesInfinite | undefined,
  messageId: string,
  patch: Partial<Message>,
): MessagesInfinite | undefined {
  if (!old) return old
  let anyChanged = false
  const pages = old.pages.map((page) => {
    let changed = false
    const messages = pageMessages(page).map((m) => {
      if (m.id !== messageId) return m
      changed = true
      return { ...m, ...patch }
    })
    if (changed) anyChanged = true
    return changed ? { ...page, messages } : page
  })
  return anyChanged ? { ...old, pages } : old
}

export function patchMessageMediaInfinite(
  old: MessagesInfinite | undefined,
  messageId: string,
  patch: Pick<Message, 'mediaUrl' | 'mediaStatus'>,
): MessagesInfinite | undefined {
  if (!old) return old
  let anyChanged = false
  const pages = old.pages.map((page) => {
    let changed = false
    const messages = pageMessages(page).map((m) => {
      if (m.id !== messageId) return m
      changed = true
      return { ...m, ...patch }
    })
    if (changed) anyChanged = true
    return changed ? { ...page, messages } : page
  })
  return anyChanged ? { ...old, pages } : old
}

export function mapMessagesInfinite(
  old: MessagesInfinite | undefined,
  mapFn: (m: Message) => Message,
): MessagesInfinite | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: pageMessages(page).map(mapFn),
    })),
  }
}

/** Migrate legacy flat `useQuery` message cache to infinite-query shape. */
export function migrateMessagesCacheShape(
  qc: QueryClient,
  conversationId: string,
): void {
  if (!conversationId) return
  const key = ['messages', conversationId] as const
  const raw = qc.getQueryData(key)
  if (!raw) return
  const coerced = coerceMessagesInfiniteData(raw)
  if (!coerced) qc.removeQueries({ queryKey: key })
  else if (raw !== coerced) qc.setQueryData(key, coerced)
}

/** Coerce persisted/legacy cache shapes before socket patches. */
export function coerceAndPatchMessagesInfinite(
  old: unknown,
  patcher: (data: MessagesInfinite) => MessagesInfinite | undefined,
): MessagesInfinite | undefined {
  const coerced = coerceMessagesInfiniteData(old)
  if (!coerced) return undefined
  return patcher(coerced)
}
