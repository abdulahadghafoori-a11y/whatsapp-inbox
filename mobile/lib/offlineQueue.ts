import { appStorage } from '@/lib/appStorage'
import { api } from '@/services/api'
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
    status: 'sent',
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
  input: Omit<PendingTextSend, 'id' | 'createdAt'>,
): Promise<Message> {
  const item: PendingTextSend = {
    ...input,
    id: `pending-text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  }
  const queue = await loadOutboundQueue()
  queue.push(item)
  await saveOutboundQueue(queue)
  return optimisticMessage(item)
}

export async function flushOutboundQueue(): Promise<{ sent: number; failed: number }> {
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
    } catch {
      failed++
      remaining.push(item)
    }
  }

  await saveOutboundQueue(remaining)
  return { sent, failed }
}
