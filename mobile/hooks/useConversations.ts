import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from '@/services/api'
import { isOnline } from '@/lib/network'
import { enqueueTextSend } from '@/lib/offlineQueue'
import axios from 'axios'
import { normalizeConversation } from '@/lib/conversation'
import { messageTypeFromMime, normalizeUploadMime } from '@/lib/mediaMime'
import { patchMessageStatus, upsertMessage } from '@/lib/messageCache'
import { playWaFeedback, playWaFeedbackAsync } from '@/lib/waFeedbackSounds'
import { normalizeMessage, normalizeMessagesResponse } from '@/lib/normalizeMessage'
import { prepareUploadFile, readPreparedAudioBase64 } from '@/lib/prepareUpload'
import type {
  ConversationDetail,
  ConversationsResponse,
  Message,
  MessagesResponse,
} from '@/types'

export function patchConversationUnreadCount(
  data: InfiniteData<ConversationsResponse> | undefined,
  conversationId: string,
  unreadCount: number,
): InfiniteData<ConversationsResponse> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount } : c,
      ),
    })),
  }
}

export type InboxFilter = 'all' | 'open' | 'resolved' | 'mine'

export function useConversations(filter: InboxFilter, search: string) {
  return useInfiniteQuery({
    queryKey: ['conversations', filter, search],
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    networkMode: 'offlineFirst',
    refetchOnMount: false,
    refetchOnReconnect: true,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = {}
      if (filter === 'mine') params.assignedTo = 'me'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      if (pageParam) params.cursor = pageParam
      const res = await api.get<ConversationsResponse>('/conversations', { params })
      return {
        ...res.data,
        conversations: res.data.conversations.map((c) => normalizeConversation(c)),
      }
    },
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const res = await api.get<{ conversation: ConversationDetail }>(
        `/conversations/${id}`,
      )
      return normalizeConversation(res.data.conversation)
    },
    enabled: !!id,
  })
}

function patchMessageInCache(
  old: MessagesResponse | undefined,
  message: Message,
): MessagesResponse | undefined {
  if (!old) return old
  const exists = old.messages.some((m) => m.id === message.id)
  return {
    ...old,
    messages: exists
      ? old.messages.map((m) => {
          if (m.id !== message.id) return m
          return {
            ...m,
            ...message,
            localPreviewUri: message.localPreviewUri ?? m.localPreviewUri,
          }
        })
      : [...old.messages, message],
  }
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    networkMode: 'offlineFirst',
    queryFn: async () => {
      const res = await api.get<MessagesResponse>(
        `/conversations/${conversationId}/messages`,
      )
      return normalizeMessagesResponse(
        res.data as { messages: (Message & Record<string, unknown>)[]; nextCursor: string | null },
      )
    },
    enabled: !!conversationId,
  })
}

export type SendTextInput = { body: string; replyToMessageId?: string }

export function useSendText(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SendTextInput) => {
      const queueLocal = () =>
        enqueueTextSend({
          conversationId,
          body: input.body,
          replyToMessageId: input.replyToMessageId,
        })

      const online = await isOnline()
      if (!online) return queueLocal()

      try {
        const res = await api.post<{ message: Message }>(
          `/conversations/${conversationId}/messages`,
          {
            type: 'text',
            body: input.body,
            ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
          },
          { headers: { 'Content-Type': 'application/json' } },
        )
        return res.data.message
      } catch (err) {
        if (isNetworkError(err)) return queueLocal()
        throw err
      }
    },
    onSuccess: (message) => {
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        patchMessageInCache(old, message),
      )
    },
  })
}

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) => {
      const res = await api.patch<{ message: Message }>(`/messages/${messageId}`, { body })
      return res.data.message
    },
    onSuccess: (message) => {
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        patchMessageInCache(old, message),
      )
    },
  })
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      await api.delete(`/messages/${messageId}`)
      return messageId
    },
    onSuccess: (messageId) => {
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === messageId
              ? { ...m, deletedAt: new Date().toISOString(), body: null }
              : m,
          ),
        }
      })
    },
  })
}

export function isNetworkError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return !err.response || err.code === 'ERR_NETWORK'
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.post(`/messages/${conversationId}/read`)
      return conversationId
    },
    onSuccess: (conversationId) => {
      qc.setQueriesData<InfiniteData<ConversationsResponse>>(
        { queryKey: ['conversations'] },
        (old) => patchConversationUnreadCount(old, conversationId, 0),
      )
    },
  })
}

export function useMarkUnread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await api.post<{ unreadCount: number }>(
        `/messages/${conversationId}/unread`,
      )
      return { conversationId, unreadCount: res.data.unreadCount }
    },
    onSuccess: ({ conversationId, unreadCount }) => {
      qc.setQueriesData<InfiniteData<ConversationsResponse>>(
        { queryKey: ['conversations'] },
        (old) => patchConversationUnreadCount(old, conversationId, unreadCount),
      )
    },
  })
}

export interface MediaUpload {
  uri: string
  name: string
  mimeType: string
  caption?: string
  /** Retry in place: update this message to pending instead of adding a new bubble. */
  replaceMessageId?: string
}

function buildOptimisticMediaMessage(
  conversationId: string,
  optimisticId: string,
  media: MediaUpload,
): Message {
  const mimeType = normalizeUploadMime(media.mimeType, media.name)
  return {
    id: optimisticId,
    conversationId,
    waMessageId: null,
    sentBy: null,
    direction: 'outbound',
    type: messageTypeFromMime(mimeType),
    body: media.caption ?? null,
    mediaUrl: null,
    mediaMimeType: mimeType,
    mediaFilename: media.name,
    mediaStatus: 'uploaded',
    status: 'pending',
    errorMessage: null,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    localPreviewUri: media.uri,
  }
}

export function useSendMedia(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (media: MediaUpload) => {
      const mimeHint = normalizeUploadMime(media.mimeType, media.name)

      if (mimeHint.startsWith('audio/')) {
        const audio = await readPreparedAudioBase64(media.uri, media.name, media.mimeType)
        const res = await api.post<{ message: Message }>(
          `/conversations/${conversationId}/messages`,
          {
            type: 'audio' as const,
            filename: audio.name,
            mimeType: normalizeUploadMime(audio.mimeType, audio.name),
            data: audio.data,
            ...(media.caption ? { caption: media.caption } : {}),
          },
          { timeout: 120_000 },
        )
        return normalizeMessage(res.data.message as Message & Record<string, unknown>)
      }

      const prepared = await prepareUploadFile(media.uri, media.name, media.mimeType)
      const mimeType = normalizeUploadMime(prepared.mimeType, prepared.name)
      const form = new FormData()
      form.append('file', {
        uri: prepared.uri,
        name: prepared.name,
        type: mimeType,
      } as unknown as Blob)
      if (media.caption) form.append('caption', media.caption)
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages`,
        form,
        { timeout: 120_000 },
      )
      return normalizeMessage(res.data.message as Message & Record<string, unknown>)
    },
    onMutate: async (media) => {
      const mime = normalizeUploadMime(media.mimeType, media.name)
      if (!mime.startsWith('audio/')) {
        void playWaFeedback('send')
      }
      const previous = qc.getQueryData<MessagesResponse>(['messages', conversationId])
      if (media.replaceMessageId) {
        qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
          patchMessageStatus(old, media.replaceMessageId!, 'pending'),
        )
        return {
          previous,
          replaceMessageId: media.replaceMessageId,
          localUri: media.uri,
        }
      }
      const optimisticId = `pending-media-${Date.now()}`
      const optimistic = buildOptimisticMediaMessage(conversationId, optimisticId, media)
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        upsertMessage(old, optimistic),
      )
      return { previous, optimisticId, localUri: media.uri }
    },
    onError: (_err, media, ctx) => {
      if (ctx?.replaceMessageId) {
        qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
          patchMessageStatus(old, ctx.replaceMessageId!, 'failed'),
        )
        return
      }
      if (!ctx?.optimisticId) return
      const failed = buildOptimisticMediaMessage(conversationId, ctx.optimisticId, media)
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        upsertMessage(old, { ...failed, status: 'failed' }, { localPreviewUri: ctx.localUri }),
      )
    },
    onSuccess: (message, _media, ctx) => {
      if (message.type === 'audio' && message.status === 'sent') {
        void playWaFeedbackAsync('sent')
      }
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) => {
        if (ctx?.replaceMessageId && old) {
          const trimmed = {
            ...old,
            messages: old.messages.filter((m) => m.id !== ctx.replaceMessageId),
          }
          return upsertMessage(trimmed, message, { localPreviewUri: ctx.localUri })
        }
        return upsertMessage(old, message, {
          removeId: ctx?.optimisticId,
          localPreviewUri: ctx?.localUri,
        })
      })
      if (message.mediaUrl) {
        void qc.invalidateQueries({ queryKey: ['media', message.mediaUrl] })
      }
      scheduleMessageSync(qc, conversationId)
    },
  })
}

function scheduleMessageSync(qc: QueryClient, conversationId: string) {
  setTimeout(() => {
    void qc.invalidateQueries({ queryKey: ['messages', conversationId] })
  }, 8000)
}

export function useResendMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages/${messageId}/resend`,
      )
      return normalizeMessage(res.data.message as Message & Record<string, unknown>)
    },
    onMutate: (messageId) => {
      void playWaFeedback('send')
      const previous = qc.getQueryData<MessagesResponse>(['messages', conversationId])
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        patchMessageStatus(old, messageId, 'pending'),
      )
      return { previous, messageId }
    },
    onError: (_err, messageId) => {
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        patchMessageStatus(old, messageId, 'failed'),
      )
    },
    onSuccess: (message) => {
      qc.setQueryData<MessagesResponse>(['messages', conversationId], (old) =>
        patchMessageInCache(old, message),
      )
      scheduleMessageSync(qc, conversationId)
    },
  })
}

export function useSendTemplate(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      templateName: string
      languageCode: string
      components?: unknown[]
    }) => {
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages/template`,
        input,
      )
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
  })
}

export function useTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ['templates'],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<{ templates: WaTemplate[] }>('/templates')
      return res.data.templates
    },
  })
}

export interface WaTemplate {
  name: string
  language: string
  status: string
  category?: string
}

export function useUpdateConversation(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: {
      status?: 'open' | 'resolved' | 'pending'
      assignedTo?: string | null
      notes?: string
    }) => {
      const res = await api.patch<{ conversation: ConversationDetail }>(
        `/conversations/${conversationId}`,
        patch,
      )
      return res.data.conversation
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
