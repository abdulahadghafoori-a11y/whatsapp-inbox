import type { Message, MessageStatus, MessagesResponse } from '@/types'

/** Instantly reflect retry / resend in the UI (clock tick, no red bubble). */
export function patchMessageStatus(
  old: MessagesResponse | undefined,
  messageId: string,
  status: MessageStatus,
  extra?: Partial<Message>,
): MessagesResponse | undefined {
  if (!old) return old
  let changed = false
  const messages = old.messages.map((m) => {
    if (m.id !== messageId) return m
    changed = true
    const now = new Date().toISOString()
    return {
      ...m,
      status,
      errorMessage: null,
      // Fresh clock so retry does not look "stale" (red bubble + retry icon).
      ...(status === 'pending' ? { sentAt: now, createdAt: m.createdAt ?? now } : {}),
      ...extra,
    }
  })
  return changed ? { ...old, messages } : old
}

/** Insert or update a message; drop stale outbound media placeholders. */
export function upsertMessage(
  old: MessagesResponse | undefined,
  message: Message,
  opts?: { removeId?: string; localPreviewUri?: string },
): MessagesResponse {
  const localPreviewUri = opts?.localPreviewUri
  const enriched: Message = {
    ...message,
    type: message.type ?? 'text',
    localPreviewUri: localPreviewUri ?? message.localPreviewUri,
  }

  let messages = (old?.messages ?? []).filter((m) => m.id !== opts?.removeId)
  if (message.direction === 'outbound' && message.type !== 'text') {
    messages = messages.filter((m) => !m.id.startsWith('pending-media-'))
  }

  const idx = messages.findIndex((m) => m.id === enriched.id)
  if (idx >= 0) {
    const next = [...messages]
    next[idx] = {
      ...next[idx],
      ...enriched,
      localPreviewUri:
        enriched.localPreviewUri ?? next[idx].localPreviewUri ?? undefined,
    }
    return { messages: next, nextCursor: old?.nextCursor ?? null }
  }

  return {
    messages: [...messages, enriched],
    nextCursor: old?.nextCursor ?? null,
  }
}
