import { appStorage } from '@/lib/appStorage'
import { api } from '@/services/api'
import {
  applyMessageToConversation,
  putLocalMessage,
  replaceLocalMessage,
} from '@/lib/db/repo'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { scheduleSync } from '@/lib/sync/syncEngine'
import type { Message } from '@/types'

const KEY = 'wa-inbox-outbound-queue'

export type PendingTextSend = {
  kind?: 'text'
  id: string
  conversationId: string
  body: string
  replyToMessageId?: string
  createdAt: string
}

export type PendingLocationSend = {
  kind: 'location'
  id: string
  conversationId: string
  latitude: number
  longitude: number
  name?: string
  address?: string
  replyToMessageId?: string
  createdAt: string
}

export type PendingOutboundSend = PendingTextSend | PendingLocationSend

function optimisticMessage(p: PendingOutboundSend): Message {
  if (p.kind === 'location') {
    return {
      id: p.id,
      conversationId: p.conversationId,
      waMessageId: null,
      sentBy: null,
      direction: 'outbound',
      type: 'location',
      body: null,
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
      metadata: {
        latitude: p.latitude,
        longitude: p.longitude,
        ...(p.name ? { name: p.name } : {}),
        ...(p.address ? { address: p.address } : {}),
      },
    }
  }
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

export async function loadOutboundQueue(): Promise<PendingOutboundSend[]> {
  const raw = await appStorage.getItem(KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PendingOutboundSend[]
  } catch {
    return []
  }
}

async function saveOutboundQueue(items: PendingOutboundSend[]) {
  await appStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueueTextSend(
  input: Omit<PendingTextSend, 'createdAt' | 'kind'> & { id?: string },
): Promise<Message> {
  const item: PendingTextSend = {
    kind: 'text',
    ...input,
    id: input.id ?? `pending-text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  }
  const queue = await loadOutboundQueue()
  queue.push(item)
  await saveOutboundQueue(queue)
  return optimisticMessage(item)
}

export async function enqueueLocationSend(
  input: Omit<PendingLocationSend, 'createdAt' | 'kind'> & { id?: string },
): Promise<Message> {
  const item: PendingLocationSend = {
    kind: 'location',
    ...input,
    id: input.id ?? `pending-location-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  }
  const queue = await loadOutboundQueue()
  queue.push(item)
  await saveOutboundQueue(queue)
  return optimisticMessage(item)
}

let flushInFlight: Promise<{ sent: number; failed: number }> | null = null

export function flushOutboundQueue(): Promise<{ sent: number; failed: number }> {
  if (flushInFlight) return flushInFlight
  flushInFlight = doFlushOutboundQueue().finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

async function postQueuedItem(item: PendingOutboundSend): Promise<Message> {
  if (item.kind === 'location') {
    const res = await api.post<{ message: Message }>(
      `/conversations/${item.conversationId}/messages`,
      {
        type: 'location' as const,
        latitude: item.latitude,
        longitude: item.longitude,
        ...(item.name ? { name: item.name } : {}),
        ...(item.address ? { address: item.address } : {}),
        ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}),
      },
      { headers: { 'Content-Type': 'application/json' } },
    )
    return normalizeMessage(res.data.message as Message & Record<string, unknown>)
  }
  const res = await api.post<{ message: Message }>(
    `/conversations/${item.conversationId}/messages`,
    {
      type: 'text',
      body: item.body,
      ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}),
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return normalizeMessage(res.data.message as Message & Record<string, unknown>)
}

async function doFlushOutboundQueue(): Promise<{ sent: number; failed: number }> {
  const queue = await loadOutboundQueue()
  if (queue.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const remaining: PendingOutboundSend[] = []

  for (const item of queue) {
    try {
      const serverMessage = await postQueuedItem(item)
      sent++
      await replaceLocalMessage(item.id, serverMessage)
      await applyMessageToConversation(serverMessage)
    } catch {
      failed++
      remaining.push(item)
    }
  }

  await saveOutboundQueue(remaining)
  if (sent > 0) scheduleSync()
  return { sent, failed }
}

/** Restore queued outbound bubbles (into the device DB) after app restart. */
export async function hydrateOutboundQueue(): Promise<void> {
  const queue = await loadOutboundQueue()
  for (const item of queue) {
    await putLocalMessage(optimisticMessage(item))
  }
}

export async function clearOutboundQueue(): Promise<void> {
  await appStorage.removeItem(KEY)
}
