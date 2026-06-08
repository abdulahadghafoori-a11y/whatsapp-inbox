import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '@/services/api'
import { isOnline } from '@/lib/network'
import { enqueueTextSend } from '@/lib/offlineQueue'
import { enqueueMediaSend } from '@/lib/offlineMediaQueue'
import { postMediaMessage } from '@/lib/postMediaMessage'
import type { MediaSendPhase } from '@/lib/mediaSendPhase'
import { clientSendMetadata, readClientSendMeta } from '@/lib/mediaSendMeta'
import { mediaSendErrorMessage } from '@/lib/mediaSendErrors'
import { normalizeConversation } from '@/lib/conversation'
import { messageTypeFromMime, normalizeUploadMime } from '@/lib/mediaMime'
import { playWaFeedback, playWaFeedbackAsync } from '@/lib/waFeedbackSounds'
import { normalizeMessage, normalizeMessagesResponse } from '@/lib/normalizeMessage'
import type { MediaQualityTier } from '@/lib/imageQualityPreference'
import { cacheMediaFromLocalFile } from '@/lib/messageMediaCache'
import { queueMessageMediaSync } from '@/lib/messageMediaSync'
import { newPendingId } from '@/lib/clientId'
import { ensureDbReady } from '@/lib/db/client'
import {
  applyMessageToConversation,
  deleteMessages,
  getConversationById,
  getMessageById,
  patchLocalConversation,
  patchLocalMessage,
  putLocalMessage,
  replaceLocalMessage,
  THREAD_PAGE_SIZE,
  upsertConversations,
  useInboxConversations,
  useThreadMessages,
} from '@/lib/db/repo'
import { loadInboxPage, loadThreadPage } from '@/lib/sync/seedCoordinator'
import { scheduleSync } from '@/lib/sync/syncEngine'
import type { InboxFilter } from '@/lib/inboxFilters'
import { useAuthStore } from '@/stores/authStore'
import type {
  ConversationDetail,
  ConversationListItem,
  Message,
  MessagesResponse,
} from '@/types'

export type { InboxFilter } from '@/lib/inboxFilters'

const isPendingId = (id: string) => id.startsWith('pending-')

/* -------------------------------------------------------------------------- */
/*  Inbox (live query over device SQLite, REST-seeded + change-feed synced)   */
/* -------------------------------------------------------------------------- */

export function useInbox(filter: InboxFilter, search: string) {
  const agentId = useAuthStore((s) => s.agent?.id ?? null)
  const live = useInboxConversations(filter, search, agentId)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  // Background refresh: never gates the UI. Cached rows render immediately from
  // the live store; the network pull just reconciles + sets the paging cursor.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensureDbReady()
        const cursor = await loadInboxPage(filter, search, null)
        if (cancelled) return
        setNextCursor(cursor)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filter, search])

  const refetch = useCallback(async () => {
    const cursor = await loadInboxPage(filter, search, null)
    setNextCursor(cursor)
  }, [filter, search])

  const fetchNextPage = useCallback(async () => {
    if (!nextCursor) return
    const cursor = await loadInboxPage(filter, search, nextCursor)
    setNextCursor(cursor)
  }, [filter, search, nextCursor])

  const hasData = live.conversations.length > 0
  return {
    conversations: live.conversations,
    // Loader only when we truly have nothing cached yet for this filter/search.
    isLoading: live.status === 'loading' && !hasData,
    isError: !!error && !hasData,
    error,
    refetch,
    fetchNextPage,
    hasNextPage: !!nextCursor,
  }
}

/** Synchronous cache of the last-seen detail per conversation for instant reopen. */
const conversationDetailCache = new Map<string, ConversationDetail>()

/** Clear module-level caches on logout so the next agent can't see stale data. */
export function clearConversationModuleCaches(): void {
  conversationDetailCache.clear()
  progressThrottle.clear()
}

export function useConversation(id: string) {
  const [fallback, setFallback] = useState<ConversationDetail | null>(
    () => conversationDetailCache.get(id) ?? null,
  )

  // Seed the header from the device DB row on first-ever open (covers the case
  // where the detail cache is cold but the conversation is already synced).
  useEffect(() => {
    let cancelled = false
    const cached = conversationDetailCache.get(id)
    if (cached) {
      setFallback(cached)
      return
    }
    setFallback(null)
    void (async () => {
      const row = await getConversationById(id)
      if (!cancelled && row) setFallback(row as unknown as ConversationDetail)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const query = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const res = await api.get<{ conversation: ConversationDetail }>(
        `/conversations/${id}`,
      )
      const conversation = normalizeConversation(res.data.conversation)
      await upsertConversations([conversation])
      conversationDetailCache.set(id, conversation)
      return conversation
    },
    enabled: !!id,
    // Render instantly from the in-memory detail cache, then refetch in background.
    initialData: () => conversationDetailCache.get(id),
    initialDataUpdatedAt: 0,
  })

  return {
    ...query,
    data: (query.data ?? fallback ?? undefined) as ConversationDetail | undefined,
  }
}

/* -------------------------------------------------------------------------- */
/*  Thread messages (live query, oldest→newest, REST-seeded + paged)         */
/* -------------------------------------------------------------------------- */

export function useMessages(conversationId: string) {
  const [limit, setLimit] = useState(THREAD_PAGE_SIZE)
  const live = useThreadMessages(conversationId, limit)
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [isFetchingOlder, setIsFetchingOlder] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Reset the window when switching conversations.
  useEffect(() => {
    setLimit(THREAD_PAGE_SIZE)
    setOlderCursor(null)
    setSeeded(false)
  }, [conversationId])

  // Background seed of the latest page — never gates the UI; the cached SQLite
  // snapshot renders instantly via the live store.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await ensureDbReady()
        const { nextCursor } = await loadThreadPage(conversationId)
        if (cancelled) return
        setOlderCursor(nextCursor)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setSeeded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  const messages = live.messages

  const fetchOlderMessages = useCallback(async () => {
    if (isFetchingOlder) return
    // Grow the local window first so already-synced older rows appear instantly.
    if (messages.length >= limit) setLimit((n) => n + THREAD_PAGE_SIZE)
    if (!olderCursor) return
    setIsFetchingOlder(true)
    try {
      const { nextCursor } = await loadThreadPage(conversationId, olderCursor)
      setOlderCursor(nextCursor)
    } catch {
      /* keep cursor; user can retry by scrolling */
    } finally {
      setIsFetchingOlder(false)
    }
  }, [conversationId, olderCursor, isFetchingOlder, messages.length, limit])

  const refetch = useCallback(async () => {
    const { nextCursor } = await loadThreadPage(conversationId)
    setOlderCursor(nextCursor)
  }, [conversationId])

  const data = useMemo(
    () =>
      messages.length || live.status === 'ready' || seeded
        ? { messages, nextCursor: olderCursor }
        : undefined,
    [messages, olderCursor, live.status, seeded],
  )

  return {
    data,
    isPending: live.status === 'loading' && messages.length === 0,
    isError: !!error && messages.length === 0,
    error,
    refetch,
    fetchOlderMessages,
    hasOlderMessages: !!olderCursor || messages.length >= limit,
    isFetchingOlder,
  }
}

/* -------------------------------------------------------------------------- */
/*  Sends — optimistic writes land in SQLite; the live query renders them.    */
/* -------------------------------------------------------------------------- */

export type SendTextInput = {
  body: string
  replyToMessageId?: string
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
  const optimisticIdRef = useRef('')
  return useMutation({
    onMutate: async (input: SendTextInput) => {
      const optimisticId = newPendingId('text')
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
      await putLocalMessage(optimistic)
      await applyMessageToConversation(optimistic)
      return { optimisticId }
    },
    mutationFn: async (input: SendTextInput): Promise<Message> => {
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
    onSuccess: async (message, _input, ctx) => {
      if (isPendingId(message.id)) {
        // Queued offline — keep the optimistic row; flush reconciles later.
        await putLocalMessage(message)
        return
      }
      await replaceLocalMessage(ctx?.optimisticId ?? '', message)
      await applyMessageToConversation(message)
      scheduleSync()
    },
    onError: async (_err, _input, ctx) => {
      if (ctx?.optimisticId) {
        await patchLocalMessage(ctx.optimisticId, { status: 'failed' })
      }
    },
  })
}

export function useSendLocation(conversationId: string) {
  return useMutation({
    onMutate: async (input: SendLocationInput) => {
      const optimisticId = newPendingId('location')
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
      await putLocalMessage(optimistic)
      await applyMessageToConversation(optimistic)
      return { optimisticId }
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
    onSuccess: async (message, _input, ctx) => {
      await replaceLocalMessage(ctx?.optimisticId ?? '', message)
      await applyMessageToConversation(message)
      scheduleSync()
    },
    onError: async (_err, _input, ctx) => {
      if (ctx?.optimisticId) {
        await patchLocalMessage(ctx.optimisticId, { status: 'failed' })
      }
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
      scheduleSync()
      return res.data
    },
  })
}

export function isNetworkError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return !err.response || err.code === 'ERR_NETWORK'
}

export function useMarkRead() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.post(`/messages/${conversationId}/read`)
      return conversationId
    },
    onMutate: async (conversationId) => {
      await patchLocalConversation(conversationId, { unreadCount: 0 })
    },
    onSuccess: () => scheduleSync(),
  })
}

export function useMarkUnread() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await api.post<{ unreadCount: number }>(
        `/messages/${conversationId}/unread`,
      )
      return { conversationId, unreadCount: res.data.unreadCount }
    },
    onSuccess: async ({ conversationId, unreadCount }) => {
      await patchLocalConversation(conversationId, { unreadCount })
    },
  })
}

export function usePinConversation() {
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
    onMutate: async ({ conversationId, pinned }) => {
      await patchLocalConversation(conversationId, {
        pinnedAt: pinned ? new Date().toISOString() : null,
      })
    },
    onSuccess: async (conversation) => {
      await upsertConversations([conversation])
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
  videoTrim?: { startMs: number; endMs: number }
  sendAsDocument?: boolean
  skipPrepare?: boolean
  preparedUri?: string
  clientMessageId?: string
}

export function buildOptimisticMediaMessage(
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
    metadata: clientSendMetadata(media, optimisticId),
  }
}

/** Per-message progress throttle state (coalesces compress/upload DB writes). */
const progressThrottle = new Map<string, { pct: number; at: number }>()

export function useSendMedia(conversationId: string) {
  async function patchPhase(messageId: string | undefined, phase: MediaSendPhase) {
    if (!messageId) return
    await patchLocalMessage(messageId, { sendPhase: phase })
  }

  // Compress/upload progress fires dozens of times per second. Coalesce DB
  // writes (≥5% advance or ≥300ms apart, plus the final 100%) so we don't thrash
  // SQLite + the change feed and trigger a re-render storm mid-send.
  async function patchProgress(
    messageId: string | undefined,
    phase: MediaSendPhase,
    key: 'compressProgress' | 'uploadProgress',
    progress: number,
  ) {
    if (!messageId) return
    const now = Date.now()
    const last = progressThrottle.get(messageId)
    const isFinal = progress >= 1
    if (last && !isFinal && progress - last.pct < 0.05 && now - last.at < 300) return
    progressThrottle.set(messageId, { pct: progress, at: now })
    const existing = await getMessageById(messageId)
    await patchLocalMessage(messageId, {
      sendPhase: phase,
      metadata: { ...(existing?.metadata ?? {}), [key]: progress },
    })
  }

  async function patchPreparedUri(
    messageId: string | undefined,
    preparedUri: string,
    media: MediaUpload,
  ) {
    if (!messageId) return
    const existing = await getMessageById(messageId)
    const clientMessageId =
      existing?.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>).clientMessageId
        : messageId
    // Keep localPreviewUri on the gallery/recording path so the bubble image never
    // reloads when prepare finishes — prepared path is upload-only metadata.
    await patchLocalMessage(messageId, {
      metadata: {
        ...(existing?.metadata ?? {}),
        ...clientSendMetadata(
          {
            uri: media.uri,
            videoTrim: media.videoTrim,
            sendAsDocument: media.sendAsDocument,
            imageQuality: media.imageQuality,
            videoQuality: media.videoQuality,
            preparedUri,
          },
          typeof clientMessageId === 'string' ? clientMessageId : messageId,
        ),
      },
    })
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
        onPhase: (phase) => void patchPhase(trackingId, phase),
        onCompressProgress: (progress) =>
          void patchProgress(trackingId, 'preparing', 'compressProgress', progress),
        onUploadProgress: (progress) =>
          void patchProgress(trackingId, 'uploading', 'uploadProgress', progress),
        onPrepared: (prepared) => {
          if (!media.skipPrepare) void patchPreparedUri(trackingId, prepared.fileUri, media)
        },
      })
    },
    onMutate: async (media) => {
      const mime = normalizeUploadMime(media.mimeType, media.name)
      if (!mime.startsWith('audio/')) {
        void playWaFeedback('send')
      }
      if (media.replaceMessageId) {
        await patchLocalMessage(media.replaceMessageId, {
          status: 'pending',
          sendPhase: 'preparing',
          errorMessage: null,
          sentAt: new Date().toISOString(),
        })
        return { replaceMessageId: media.replaceMessageId, localUri: media.uri }
      }
      const optimisticId = media.clientMessageId ?? newPendingId('media')
      if (media.clientMessageId) {
        const existing = await getMessageById(media.clientMessageId)
        if (existing) {
          await patchLocalMessage(media.clientMessageId, {
            status: 'pending',
            sendPhase: 'preparing',
            errorMessage: null,
            localPreviewUri: media.uri,
            sentAt: new Date().toISOString(),
          })
          return { optimisticId: media.clientMessageId, localUri: media.uri }
        }
      }
      const optimistic: Message = {
        ...buildOptimisticMediaMessage(conversationId, optimisticId, media),
        sendPhase: 'preparing',
      }
      await putLocalMessage(optimistic)
      await applyMessageToConversation(optimistic)
      void cacheMediaFromLocalFile(
        optimisticId,
        conversationId,
        media.uri,
        mime,
        media.name,
      )
      return { optimisticId, localUri: media.uri }
    },
    onError: async (err, media, ctx) => {
      const cleanupId = ctx?.replaceMessageId ?? ctx?.optimisticId
      if (cleanupId) progressThrottle.delete(cleanupId)
      if (err instanceof Error && err.message === 'QUEUED_OFFLINE') {
        if (ctx?.optimisticId) {
          await patchLocalMessage(ctx.optimisticId, { sendPhase: 'queued', status: 'pending' })
        }
        return
      }
      const errMsg = mediaSendErrorMessage(err)
      const trackingId = ctx?.replaceMessageId ?? ctx?.optimisticId
      const cached = trackingId ? await getMessageById(trackingId) : null
      const clientSend = cached ? readClientSendMeta(cached) : undefined
      const previewUri = clientSend?.preparedUri ?? cached?.localPreviewUri ?? ctx?.localUri

      if (ctx?.replaceMessageId) {
        await patchLocalMessage(ctx.replaceMessageId, {
          status: 'failed',
          sendPhase: undefined,
          errorMessage: errMsg,
          localPreviewUri: previewUri,
        })
        return
      }
      if (!ctx?.optimisticId) return
      const failed = buildOptimisticMediaMessage(conversationId, ctx.optimisticId, media)
      await putLocalMessage({
        ...failed,
        status: 'failed',
        errorMessage: errMsg,
        sendPhase: undefined,
        localPreviewUri: previewUri,
        metadata: cached?.metadata ?? failed.metadata,
      })
    },
    onSuccess: async (message, _media, ctx) => {
      if (message.type === 'audio' && message.status === 'sent') {
        void playWaFeedbackAsync('sent')
      }
      const trackingId = ctx?.replaceMessageId ?? ctx?.optimisticId
      if (trackingId) progressThrottle.delete(trackingId)
      const cached = trackingId ? await getMessageById(trackingId) : null
      const previewUri =
        readClientSendMeta(cached ?? message)?.preparedUri ??
        cached?.localPreviewUri ??
        ctx?.localUri
      const enriched: Message = {
        ...message,
        // Upload to our server is done — clear client send UI; bubble status handles WA delivery.
        sendPhase: undefined,
        localPreviewUri: previewUri,
        metadata: cached?.metadata ?? message.metadata,
      }
      if (ctx?.replaceMessageId) {
        await replaceLocalMessage(ctx.replaceMessageId, enriched)
      } else {
        await replaceLocalMessage(ctx?.optimisticId ?? '', enriched)
      }
      await applyMessageToConversation(enriched)
      if (message.type !== 'text' && message.type !== 'location') {
        queueMessageMediaSync(message)
      }
      scheduleSync()
    },
  })
}

export function useResendMessage(conversationId: string) {
  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await api.post<{ message: Message }>(
        `/conversations/${conversationId}/messages/${messageId}/resend`,
      )
      return normalizeMessage(res.data.message as Message & Record<string, unknown>)
    },
    onMutate: async (messageId) => {
      void playWaFeedback('send')
      await patchLocalMessage(messageId, { status: 'pending', errorMessage: null })
      return { messageId }
    },
    onError: async (_err, messageId) => {
      await patchLocalMessage(messageId, { status: 'failed' })
    },
    onSuccess: async (message) => {
      await patchLocalMessage(message.id, message)
      scheduleSync()
    },
  })
}

export function useSendTemplate(conversationId: string) {
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
    onSuccess: async (message) => {
      await putLocalMessage(message)
      await applyMessageToConversation(message)
      scheduleSync()
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
    onSuccess: async (conversation) => {
      await upsertConversations([normalizeConversation(conversation)])
      scheduleSync()
    },
  })
}
