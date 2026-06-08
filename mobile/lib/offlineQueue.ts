import { appStorage } from '@/lib/appStorage'
import { api } from '@/services/api'
import { putLocalMessage, deleteMessages } from '@/lib/db/repo'
import { scheduleSync } from '@/lib/sync/syncEngine'
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
      // Drop the optimistic placeholder now that the server has the message; the
      // real row arrives via the change-feed sync we kick below.
      await deleteMessages([item.id])
    } catch {
      failed++
      remaining.push(item)
    }
  }

  await saveOutboundQueue(remaining)
  if (sent > 0) scheduleSync()
  return { sent, failed }
}

/** Restore queued outbound text bubbles (into the device DB) after app restart. */
export async function hydrateOutboundQueue(): Promise<void> {
  const queue = await loadOutboundQueue()
  for (const item of queue) {
    await putLocalMessage(optimisticMessage(item))
  }
}

/** Drop all queued sends (e.g. on logout) without attempting delivery. */
export async function clearOutboundQueue(): Promise<void> {
  await appStorage.removeItem(KEY)
}
