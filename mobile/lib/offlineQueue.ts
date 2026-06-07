import type { QueryClient } from '@tanstack/react-query'
import { appStorage } from '@/lib/appStorage'
import { api } from '@/services/api'
import { queryClient } from '@/lib/queryClient'
import {
  removeMessageInfinite,
  upsertMessageInfinite,
  type MessagesInfinite,
} from '@/lib/messagesQueryCache'
import type { Message } from '@/types'

const KEY = 'wa-inbox-outbound-queue'

export type PendingTextSend = {
  id: string
  conversationId: string
  body: string
  replyToMessageId?: string
  createdAt: string
}

function optimisticMessage(p: PendingTextSend): Message {
  return {
    id: p.id,
    conversationId: p.conversationId,
    waMessageId: null,
    sentBy: null,
    direction: 'outbound',
    type: 'text',
    body: p.body,
    mediaUrl: null,
    mediaMimeType: null,
    mediaFilename: null,
    mediaStatus: null,
    status: 'pending',
    sendPhase: 'queued',
    errorMessage: null,
    sentAt: p.createdAt,
    createdAt: p.createdAt,
    replyToMessageId: p.replyToMessageId ?? null,
    deletedAt: null,
    editedAt: null,
    replyTo: null,
  }
}

export async function loadOutboundQueue(): Promise<PendingTextSend[]> {
  const raw = await appStorage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PendingTextSend[]
  } catch {
    return []
  }
}

async function saveOutboundQueue(items: PendingTextSend[]) {
  await appStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueueTextSend(
  input: Omit<PendingTextSend, 'createdAt'> & { id?: string },
): Promise<Message> {
  const item: PendingTextSend = {
    ...input,
    id: input.id ?? `pending-text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  }
  const queue = await loadOutboundQueue()
  queue.push(item)
  await saveOutboundQueue(queue)
  return optimisticMessage(item)
}

// Guard against concurrent flushes (mount + NetInfo + AppState can fire at once).
// Without this, two overlapping flushes read the same queue and POST every item
// twice, double-sending the customer's text.
let flushInFlight: Promise<{ sent: number; failed: number }> | null = null

export function flushOutboundQueue(): Promise<{ sent: number; failed: number }> {
  if (flushInFlight) return flushInFlight
  flushInFlight = doFlushOutboundQueue().finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

async function doFlushOutboundQueue(): Promise<{ sent: number; failed: number }> {
  const queue = await loadOutboundQueue()
  if (queue.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const remaining: PendingTextSend[] = []

  for (const item of queue) {
    try {
      await api.post(
        `/conversations/${item.conversationId}/messages`,
        {
          type: 'text',
          body: item.body,
          ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}),
        },
        { headers: { 'Content-Type': 'application/json' } },
      )
      sent++
      // Drop the optimistic placeholder now that the server has the message. The
      // real row arrives via the new_message socket event / refetch. Was: the
      // pending bubble lingered and showed as a duplicate alongside the echo.
      queryClient.setQueryData<MessagesInfinite>(
        ['messages', item.conversationId],
        (old) => removeMessageInfinite(old, item.id),
      )
    } catch {
      failed++
      remaining.push(item)
    }
  }

  await saveOutboundQueue(remaining)
  return { sent, failed }
}

/** Restore queued outbound text bubbles after app restart. */
export async function hydrateOutboundQueue(qc: QueryClient): Promise<void> {
  const queue = await loadOutboundQueue()
  for (const item of queue) {
    qc.setQueryData<MessagesInfinite>(['messages', item.conversationId], (old) =>
      upsertMessageInfinite(old, optimisticMessage(item)),
    )
  }
}

/** Drop all queued sends (e.g. on logout) without attempting delivery. */
export async function clearOutboundQueue(): Promise<void> {
  await appStorage.removeItem(KEY)
}
