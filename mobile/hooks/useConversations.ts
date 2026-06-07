import { useEffect, useMemo, useRef } from 'react'
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
import { enqueueMediaSend } from '@/lib/offlineMediaQueue'
import { postMediaMessage } from '@/lib/postMediaMessage'
import type { MediaSendPhase } from '@/lib/mediaSendPhase'
import { clientSendMetadata, readClientSendMeta } from '@/lib/mediaSendMeta'
import { mediaSendErrorMessage } from '@/lib/mediaSendErrors'
import axios from 'axios'
import { normalizeConversation } from '@/lib/conversation'
import { messageTypeFromMime, normalizeUploadMime } from '@/lib/mediaMime'
import {
  type MessagesInfinite,
  coerceMessagesInfiniteData,
  migrateMessagesCacheShape,
  flattenMessagesPages,
  pageMessages,
  patchMessageFieldsInfinite,
  patchMessageStatusInfinite,
  upsertMessageInfinite,
} from '@/lib/messagesQueryCache'
import { playWaFeedback, playWaFeedbackAsync } from '@/lib/waFeedbackSounds'
import { normalizeMessage, normalizeMessagesResponse } from '@/lib/normalizeMessage'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import { patchInboxQueriesForMessage } from '@/lib/inboxCachePatch'
import { queueMessageMediaSync } from '@/lib/messageMediaSync'
import type {
  ConversationDetail,
  ConversationListItem,
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

function sortInboxConversations(list: ConversationListItem[]) {
  return [...list].sort((a, b) => {
    const pinA = a.pinnedAt ? 1 : 0
    const pinB = b.pinnedAt ? 1 : 0
    if (pinA !== pinB) return pinB - pinA
    const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return tB - tA
  })
}

export function patchConversationPin(
  data: InfiniteData<ConversationsResponse> | undefined,
  conversation: ConversationListItem,
): InfiniteData<ConversationsResponse> | undefined {
  if (!data) return data
  let found = false
  const pages = data.pages.map((page) => {
    const conversations = page.conversations.map((c) => {
      if (c.id !== conversation.id) return c
      found = true
      return normalizeConversation({ ...c, ...conversation })
    })
    return { ...page, conversations: sortInboxConversations(conversations) }
  })
  if (!found && pages[0]) {
    pages[0] = {
      ...pages[0],
      conversations: sortInboxConversations([
        normalizeConversation(conversation),
        ...pages[0].conversations,
      ]),
    }
  }
  return { ...data, pages }
}

export function patchConversationLastMessageStatus(
  data: InfiniteData<ConversationsResponse> | undefined,
  conversationId: string,
  messageId: string,
  status: Message['status'],
): InfiniteData<ConversationsResponse> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((c) => {
        if (c.id !== conversationId) return c
        if (c.lastMessageId && c.lastMessageId !== messageId) return c
        if (c.lastMessageDirection !== 'outbound') return c
        return { ...c, lastMessageStatus: status }
      }),
    })),
  }
}

export type InboxFilter = 'all' | 'open' | 'resolved' | 'mine'

export function useConversations(filter: InboxFilter, search: string) {
  return useInfiniteQuery({
    queryKey: ['conversations', filter, search],
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
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

function patchMessageInCacheInfinite(
  old: MessagesInfinite | undefined,
  message: Message,
): MessagesInfinite | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => {
      const list = pageMessages(page)
      const exists = list.some((m) => m.id === message.id)
      if (!exists) return page
      return {
        ...page,
        messages: list.map((m) =>
          m.id === message.id
            ? {
                ...m,
                ...message,
                localPreviewUri: message.localPreviewUri ?? m.localPreviewUri,
              }
            : m,
        ),
      }
    }),
  }
}

export function useMessages(conversationId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    migrateMessagesCacheShape(qc, conversationId)
  }, [qc, conversationId])

  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    networkMode: 'offlineFirst',
    initialPageParam: null as string | null,
    enabled: !!conversationId,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<MessagesResponse>(
        `/conversations/${conversationId}/messages`,
        { params: pageParam ? { before: pageParam } : {} },
      )
      const incoming = normalizeMessagesResponse(
        res.data as { messages: (Message & Record<string, unknown>)[]; nextCursor: string | null },
      )
      const previous = coerceMessagesInfiniteData(
        qc.getQueryData(['messages', conversationId]),
      )
      const flatPrev = previous?.pages.flatMap((p) => p.messages) ?? []
      if (!flatPrev.length) return incoming

      const localById = new Map(
        flatPrev.filter((m) => m.localPreviewUri).map((m) => [m.id, m.localPreviewUri!]),
      )
      if (localById.size === 0) return incoming

      return {
        ...incoming,
        messages: incoming.messages.map((m) => ({
          ...m,
          localPreviewUri: m.localPreviewUri ?? localById.get(m.id),
        })),
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  })

  const infinite = coerceMessagesInfiniteData(query.data) ?? query.data
  const messages = useMemo(() => flattenMessagesPages(infinite), [infinite])
  const nextCursor = infinite?.pages.at(-1)?.nextCursor ?? null
  const data = useMemo(
    () => (infinite ? { messages, nextCursor } : undefined),
    [infinite, messages, nextCursor],
  )

  return {
    ...query,
    data,
    fetchOlderMessages: query.fetchNextPage,
    hasOlderMessages: query.hasNextPage,
    isFetchingOlder: query.isFetchingNextPage,
  }
}

export type SendTextInput = {
  body: string
  replyToMessageId?: string
  /** Optimistic reply quote in the thread. */
  replyToPreview?: Message['replyTo']
}

export type SendLocationInput = {
  latitude: number
  longitude: number
  name?: string
  address?: string
  replyToMessageId?: string
  replyToPreview?: Message['replyTo']
}

export function useSendText(conversationId: string) {
  const qc = useQueryClient()
  const optimisticIdRef = useRef('')
  return useMutation({
    onMutate: async (input) => {
      const previous = qc.getQueryData<MessagesInfinite>(['messages', conversationId])
      const optimisticId = `pending-text-${Date.now()}`
      optimisticIdRef.current = optimisticId
      const optimistic: Message = {
        id: optimisticId,
        conversationId,
        waMessageId: null,
        sentBy: null,
        direction: 'outbound',
        type: 'text',
        body: input.body,
        mediaUrl: null,
        mediaMimeType: null,
        mediaFilename: null,
        mediaStatus: 'uploaded',
        status: 'pending',
        errorMessage: null,
        replyToMessageId: input.replyToMessageId ?? null,
        replyTo: input.replyToPreview ?? null,
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, optimistic),
      )
      patchInboxQueriesForMessage(qc, conversationId, optimistic, { suppressUnread: true })
      return { previous, optimisticId }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['messages', conversationId], ctx.previous)
      }
    },
    mutationFn: async (input: SendTextInput) => {
      const queueLocal = () =>
        enqueueTextSend({
          id: optimisticIdRef.current,
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
        return normalizeMessage(res.data.message as Message & Record<string, unknown>)
      } catch (err) {
        if (isNetworkError(err)) return queueLocal()
        throw err
      }
    },
    onSuccess: (message, _input, ctx) => {
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, message, { removeId: ctx?.optimisticId }),
      )
      patchInboxQueriesForMessage(qc, conversationId, message, { suppressUnread: true })
    },
  })
}

export function useForwardMessage() {
  return useMutation({
    mutationFn: async ({
      messageId,
      targetConversationIds,
    }: {
      messageId: string
      targetConversationIds: string[]
    }) => {
      const res = await api.post<{
        okCount: number
        results: Array<{ conversationId: string; ok: boolean; error?: string }>
      }>('/conversations/forward-batch', { messageId, targetConversationIds }, {
        timeout: 180_000,
      })
      return res.data
    },
  })
}

export function useSendLocation(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    onMutate: async (input) => {
      const previous = qc.getQueryData<MessagesInfinite>(['messages', conversationId])
      const optimisticId = `pending-location-${Date.now()}`
      const metadata = {
        latitude: input.latitude,
        longitude: input.longitude,
        ...(input.name ? { name: input.name } : {}),
        ...(input.address ? { address: input.address } : {}),
      }
      const optimistic: Message = {
        id: optimisticId,
        conversationId,
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
        errorMessage: null,
        replyToMessageId: input.replyToMessageId ?? null,
        replyTo: input.replyToPreview ?? null,
        metadata,
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, optimistic),
      )
      return { previous, optimisticId }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['messages', conversationId], ctx.previous)
      }
    },
    mutationFn: async (input: SendLocationInput) => {
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages`,
        {
          type: 'location' as const,
          latitude: input.latitude,
          longitude: input.longitude,
          ...(input.name ? { name: input.name } : {}),
          ...(input.address ? { address: input.address } : {}),
          ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
        },
        { headers: { 'Content-Type': 'application/json' } },
      )
      return normalizeMessage(res.data.message as Message & Record<string, unknown>)
    },
    onSuccess: (message, _input, ctx) => {
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, message, { removeId: ctx?.optimisticId }),
      )
      patchInboxQueriesForMessage(qc, conversationId, message, { suppressUnread: true })
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

export function usePinConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      conversationId,
      pinned,
    }: {
      conversationId: string
      pinned: boolean
    }) => {
      const res = await api.patch<{ conversation: ConversationDetail }>(
        `/conversations/${conversationId}`,
        { pinned },
      )
      return normalizeConversation(res.data.conversation)
    },
    onSuccess: (conversation) => {
      qc.setQueryData(['conversation', conversation.id], conversation)
      qc.setQueriesData<InfiniteData<ConversationsResponse>>(
        { queryKey: ['conversations'] },
        (old) => patchConversationPin(old, conversation),
      )
    },
  })
}

export interface MediaUpload {
  uri: string
  name: string
  mimeType: string
  caption?: string
  imageQuality?: MediaQualityTier
  videoQuality?: MediaQualityTier
  replyToMessageId?: string
  replyToPreview?: Message['replyTo']
  /** Retry in place: update this message to pending instead of adding a new bubble. */
  replaceMessageId?: string
  /** Set when video was trimmed before upload. */
  videoTrim?: { startMs: number; endMs: number }
  /** Skip video transcode; send as document (up to 100MB). */
  sendAsDocument?: boolean
  /** Skip trim/compress — preparedUri is ready to upload. */
  skipPrepare?: boolean
  preparedUri?: string
  /** Stable id for optimistic bubble + phase updates. */
  clientMessageId?: string
}

function buildOptimisticMediaMessage(
  conversationId: string,
  optimisticId: string,
  media: MediaUpload,
): Message {
  const mimeType = normalizeUploadMime(media.mimeType, media.name)
  const type = media.sendAsDocument ? 'document' : messageTypeFromMime(mimeType)
  return {
    id: optimisticId,
    conversationId,
    waMessageId: null,
    sentBy: null,
    direction: 'outbound',
    type,
    body: media.caption ?? null,
    mediaUrl: null,
    mediaMimeType: mimeType,
    mediaFilename: media.name,
    mediaStatus: 'uploaded',
    status: 'pending',
    errorMessage: null,
    replyToMessageId: media.replyToMessageId ?? null,
    replyTo: media.replyToPreview ?? null,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    localPreviewUri: media.uri,
    metadata: clientSendMetadata(media),
  }
}

export function useSendMedia(conversationId: string) {
  const qc = useQueryClient()

  function patchPhase(messageId: string | undefined, phase: MediaSendPhase) {
    if (!messageId) return
    qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
      patchMessageFieldsInfinite(old, messageId, { sendPhase: phase }),
    )
  }

  function patchPreparedUri(messageId: string | undefined, preparedUri: string, media: MediaUpload) {
    if (!messageId) return
    qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
      patchMessageFieldsInfinite(old, messageId, {
        localPreviewUri: preparedUri,
        metadata: clientSendMetadata({
          uri: media.uri,
          videoTrim: media.videoTrim,
          sendAsDocument: media.sendAsDocument,
          imageQuality: media.imageQuality,
          videoQuality: media.videoQuality,
          preparedUri,
        }),
      }),
    )
  }

  return useMutation({
    mutationFn: async (media: MediaUpload) => {
      const online = await isOnline()
      const trackingId = media.clientMessageId ?? media.replaceMessageId
      if (!online) {
        const queued = await enqueueMediaSend({
          id: media.clientMessageId,
          conversationId,
          sourceUri: media.uri,
          name: media.name,
          mimeType: media.mimeType,
          caption: media.caption,
          replyToMessageId: media.replyToMessageId,
          imageQuality: media.imageQuality,
          videoTrim: media.videoTrim,
          videoQuality: media.videoQuality,
          sendAsDocument: media.sendAsDocument,
        })
        throw Object.assign(new Error('QUEUED_OFFLINE'), { queued })
      }

      const uploadUri = media.skipPrepare && media.preparedUri ? media.preparedUri : media.uri
      return postMediaMessage(conversationId, {
        uri: uploadUri,
        name: media.name,
        mimeType: media.mimeType,
        caption: media.caption,
        replyToMessageId: media.replyToMessageId,
        imageQuality: media.imageQuality,
        videoQuality: media.videoQuality,
        videoTrim: media.skipPrepare ? undefined : media.videoTrim,
        sendAsDocument: media.sendAsDocument,
        skipPrepare: media.skipPrepare,
        onPhase: (phase) => patchPhase(trackingId, phase),
        onCompressProgress: (progress) => {
          qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) => {
            const existing = flattenMessagesPages(old).find((m) => m.id === trackingId)
            return patchMessageFieldsInfinite(old, trackingId!, {
              sendPhase: 'preparing',
              metadata: { ...(existing?.metadata ?? {}), compressProgress: progress },
            })
          })
        },
        onUploadProgress: (progress) => {
          qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) => {
            const existing = flattenMessagesPages(old).find((m) => m.id === trackingId)
            return patchMessageFieldsInfinite(old, trackingId!, {
              sendPhase: 'uploading',
              metadata: { ...(existing?.metadata ?? {}), uploadProgress: progress },
            })
          })
        },
        onPrepared: (prepared) => {
          if (!media.skipPrepare) {
            patchPreparedUri(trackingId, prepared.fileUri, media)
          }
        },
      })
    },
    onMutate: async (media) => {
      const mime = normalizeUploadMime(media.mimeType, media.name)
      if (!mime.startsWith('audio/')) {
        void playWaFeedback('send')
      }
      const previous = qc.getQueryData<MessagesInfinite>(['messages', conversationId])
      if (media.replaceMessageId) {
        qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
          patchMessageStatusInfinite(old, media.replaceMessageId!, 'pending', {
            sendPhase: 'preparing',
            errorMessage: null,
            sentAt: new Date().toISOString(),
          }),
        )
        return {
          previous,
          replaceMessageId: media.replaceMessageId,
          localUri: media.uri,
        }
      }
      const optimisticId = media.clientMessageId ?? `pending-media-${Date.now()}`
      const optimistic = {
        ...buildOptimisticMediaMessage(conversationId, optimisticId, media),
        sendPhase: 'preparing' as const,
      }
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, optimistic),
      )
      patchInboxQueriesForMessage(qc, conversationId, optimistic, { suppressUnread: true })
      return { previous, optimisticId, localUri: media.uri }
    },
    onError: (err, media, ctx) => {
      if (err instanceof Error && err.message === 'QUEUED_OFFLINE') {
        const queued = (err as Error & { queued?: { id: string; createdAt: string } }).queued
        if (queued && ctx?.optimisticId) {
          qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
            patchMessageFieldsInfinite(old, ctx.optimisticId!, {
              sendPhase: 'queued',
              status: 'pending',
            }),
          )
        }
        return
      }
      const errMsg = mediaSendErrorMessage(err)
      const trackingId = ctx?.replaceMessageId ?? ctx?.optimisticId
      const cached = trackingId
        ? flattenMessagesPages(
            qc.getQueryData<MessagesInfinite>(['messages', conversationId]),
          ).find((m) => m.id === trackingId)
        : undefined
      const clientSend = cached ? readClientSendMeta(cached) : undefined
      const previewUri = clientSend?.preparedUri ?? cached?.localPreviewUri ?? ctx?.localUri

      if (ctx?.replaceMessageId) {
        qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
          patchMessageStatusInfinite(old, ctx.replaceMessageId!, 'failed', {
            errorMessage: errMsg,
            sendPhase: undefined,
            localPreviewUri: previewUri,
          }),
        )
        return
      }
      if (!ctx?.optimisticId) return
      const failed = buildOptimisticMediaMessage(conversationId, ctx.optimisticId, media)
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(
          old,
          {
            ...failed,
            status: 'failed',
            errorMessage: errMsg,
            sendPhase: undefined,
            localPreviewUri: previewUri,
            metadata: cached?.metadata ?? failed.metadata,
          },
          { localPreviewUri: previewUri },
        ),
      )
    },
    onSuccess: (message, _media, ctx) => {
      if (message.type === 'audio' && message.status === 'sent') {
        void playWaFeedbackAsync('sent')
      }
      const trackingId = ctx?.replaceMessageId ?? ctx?.optimisticId
      const cached = trackingId
        ? flattenMessagesPages(
            qc.getQueryData<MessagesInfinite>(['messages', conversationId]),
          ).find((m) => m.id === trackingId)
        : undefined
      const previewUri =
        readClientSendMeta(cached ?? message)?.preparedUri ??
        cached?.localPreviewUri ??
        ctx?.localUri
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) => {
        const enriched = {
          ...message,
          sendPhase: message.status === 'sent' ? undefined : ('sending' as const),
          localPreviewUri: previewUri,
          metadata: cached?.metadata ?? message.metadata,
        }
        if (ctx?.replaceMessageId && old?.pages.length) {
          const pages = [...old.pages]
          const first = pages[0]
          pages[0] = {
            ...first,
            messages: first.messages.filter((m) => m.id !== ctx.replaceMessageId),
          }
          return upsertMessageInfinite({ ...old, pages }, enriched, { localPreviewUri: previewUri })
        }
        return upsertMessageInfinite(old, enriched, {
          removeId: ctx?.optimisticId,
          localPreviewUri: previewUri,
        })
      })
      if (message.mediaUrl) {
        void qc.invalidateQueries({ queryKey: ['media', message.mediaUrl] })
      }
      if (message.type !== 'text' && message.type !== 'location') {
        queueMessageMediaSync(message)
      }
      patchInboxQueriesForMessage(qc, conversationId, message, { suppressUnread: true })
    },
  })
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
      const previous = qc.getQueryData<MessagesInfinite>(['messages', conversationId])
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        patchMessageStatusInfinite(old, messageId, 'pending'),
      )
      return { previous, messageId }
    },
    onError: (_err, messageId, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['messages', conversationId], ctx.previous)
        return
      }
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        patchMessageStatusInfinite(old, messageId, 'failed'),
      )
    },
    onSuccess: (message) => {
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        patchMessageInCacheInfinite(old, message),
      )
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
      return normalizeMessage(res.data.message as Message & Record<string, unknown>)
    },
    onSuccess: (message) => {
      qc.setQueryData<MessagesInfinite>(['messages', conversationId], (old) =>
        upsertMessageInfinite(old, message),
      )
      patchInboxQueriesForMessage(qc, conversationId, message, { suppressUnread: true })
    },
  })
}

export function useMessageSearch(conversationId: string, term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: ['messages', conversationId, 'search', q],
    enabled: !!conversationId && q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<MessagesResponse>(`/conversations/${conversationId}/messages`, {
        params: { q },
      })
      return normalizeMessagesResponse(
        res.data as { messages: (Message & Record<string, unknown>)[]; nextCursor: string | null },
      ).messages
    },
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
