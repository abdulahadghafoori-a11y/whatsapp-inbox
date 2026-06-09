import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { getMessageById, patchLocalMessage } from '@/lib/db/repo'
import { scheduleSync } from '@/lib/sync/syncEngine'
import { useAuthStore } from '@/stores/authStore'
import type { Message, MessageReaction } from '@/types'

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export function useToggleMessageStar(_conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, starred }: { messageId: string; starred: boolean }) => {
      const res = await api.patch<{ message: Message & Record<string, unknown> }>(
        `/messages/${messageId}/star`,
        { starred },
      )
      return normalizeMessage(res.data.message)
    },
    onMutate: async ({ messageId, starred }) => {
      await patchLocalMessage(messageId, {
        starredAt: starred ? new Date().toISOString() : null,
      })
    },
    onSuccess: async (message) => {
      const existing = await getMessageById(message.id)
      if (existing?.starredAt !== message.starredAt) {
        void patchLocalMessage(message.id, { starredAt: message.starredAt })
      }
      void qc.invalidateQueries({ queryKey: ['starred-messages'] })
      scheduleSync()
    },
  })
}

export function useToggleMessageReaction(_conversationId: string) {
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await api.post<{ messageId: string; reactions: MessageReaction[] }>(
        `/messages/${messageId}/reactions`,
        { emoji },
      )
      return res.data
    },
    onMutate: async ({ messageId, emoji }) => {
      const existing = await getMessageById(messageId)
      const agent = useAuthStore.getState().agent
      if (!agent) return { messageId, previous: existing?.reactions }
      const reactions = [...(existing?.reactions ?? [])]
      const idx = reactions.findIndex((r) => r.agentId === agent.id && r.emoji === emoji)
      if (idx >= 0) reactions.splice(idx, 1)
      else reactions.push({ emoji, agentId: agent.id, agentName: agent.name ?? null })
      await patchLocalMessage(messageId, { reactions })
      return { messageId, previous: existing?.reactions }
    },
    onSuccess: () => {
      scheduleSync()
    },
    onError: async (_err, { messageId }, ctx) => {
      if (ctx?.previous !== undefined) {
        await patchLocalMessage(messageId, { reactions: ctx.previous })
      }
      scheduleSync()
    },
  })
}

export function useStarredMessages() {
  return useInfiniteQuery({
    queryKey: ['starred-messages'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{
        messages: (Message & Record<string, unknown> & { contactName?: string })[]
        nextCursor: string | null
      }>('/messages/starred', { params: pageParam ? { cursor: pageParam } : {} })
      return {
        messages: res.data.messages.map((m) => normalizeMessage(m)),
        contactNames: Object.fromEntries(
          res.data.messages.map((m) => [m.id, m.contactName ?? 'Chat']),
        ),
        nextCursor: res.data.nextCursor,
      }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export type MediaGalleryItem = {
  id: string
  type: string
  body: string | null
  mediaUrl: string | null
  mediaThumbUrl: string | null
  mediaFileSize: number | null
  mediaMimeType: string | null
  mediaFilename: string | null
  sentAt: string
  direction: string
}

export function useConversationMediaGallery(conversationId: string, type: 'all' | 'image' | 'video' = 'all') {
  return useInfiniteQuery({
    queryKey: ['media-gallery', conversationId, type],
    enabled: !!conversationId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ items: MediaGalleryItem[]; nextCursor: string | null }>(
        `/conversations/${conversationId}/media-gallery`,
        { params: { ...(pageParam ? { before: pageParam } : {}), type } },
      )
      return res.data
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
