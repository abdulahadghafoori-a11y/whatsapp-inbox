import type { InfiniteData } from '@tanstack/react-query'
import { mergeMessageStatus, normalizeMessageStatus } from '@/lib/messageStatus'
import type { Message, MessageStatus, MessagesResponse } from '@/types'

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

export function flattenMessagesPages(data: MessagesInfinite | undefined): Message[] {
  if (!data?.pages.length) return []
  return data.pages.flatMap((p) => p.messages)
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
  const messages = old.messages.map((m) => {
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
  const localPreviewUri = opts?.localPreviewUri
  const enriched: Message = {
    ...message,
    type: message.type ?? 'text',
    localPreviewUri: localPreviewUri ?? message.localPreviewUri,
  }

  if (!old?.pages.length) {
    return {
      pageParams: [null],
      pages: [{ messages: [enriched], nextCursor: null }],
    }
  }

  const pages = [...old.pages]
  const first = pages[0] ?? { messages: [], nextCursor: null }
  let messages = first.messages.filter((m) => m.id !== opts?.removeId)
  if (message.direction === 'outbound' && message.type !== 'text') {
    messages = messages.filter((m) => !m.id.startsWith('pending-media-'))
  }
  const idx = messages.findIndex((m) => m.id === enriched.id)
  if (idx >= 0) {
    const next = [...messages]
    next[idx] = {
      ...next[idx],
      ...enriched,
      localPreviewUri: enriched.localPreviewUri ?? next[idx].localPreviewUri ?? undefined,
    }
    pages[0] = { ...first, messages: next }
  } else {
    pages[0] = { ...first, messages: [...messages, enriched] }
  }
  return { ...old, pages }
}

export function removeMessageInfinite(
  old: MessagesInfinite | undefined,
  messageId: string,
): MessagesInfinite | undefined {
  if (!old) return old
  let anyChanged = false
  const pages = old.pages.map((page) => {
    const messages = page.messages.filter((m) => m.id !== messageId)
    if (messages.length !== page.messages.length) anyChanged = true
    return messages.length !== page.messages.length ? { ...page, messages } : page
  })
  return anyChanged ? { ...old, pages } : old
}

export function patchMessagesStatusInfinite(
  old: MessagesInfinite | undefined,
  payload: {
    messageId?: string
    waMessageId?: string
    status: string
  },
): MessagesInfinite | undefined {
  if (!old) return old
  const normalized = normalizeMessageStatus(payload.status)
  if (!normalized) return old
  let anyChanged = false
  const pages = old.pages.map((page) => {
    let changed = false
    const messages = page.messages.map((m) => {
      if (m.direction !== 'outbound') return m
      const idMatch = payload.messageId != null && m.id === payload.messageId
      const waMatch = payload.waMessageId != null && m.waMessageId === payload.waMessageId
      if (!idMatch && !waMatch) return m
      const next = mergeMessageStatus(m.status, normalized)
      if (next === m.status) return m
      changed = true
      return { ...m, status: next }
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
    const messages = page.messages.map((m) => {
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
      messages: page.messages.map(mapFn),
    })),
  }
}
