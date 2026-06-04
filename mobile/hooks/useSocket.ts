import { useEffect } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import {
  patchConversationLastMessageStatus,
  patchConversationUnreadCount,
} from '@/hooks/useConversations'
import { normalizeConversation } from '@/lib/conversation'
import { normalizeMessage } from '@/lib/normalizeMessage'
import { upsertMessage } from '@/lib/messageCache'
import { syncMessageMedia } from '@/lib/messageMediaSync'
import { mergeMessageStatus, normalizeMessageStatus } from '@/lib/messageStatus'
import { playWaFeedbackAsync } from '@/lib/waFeedbackSounds'
import { useAuthStore } from '@/stores/authStore'
import type {
  Agent,
  ConversationDetail,
  ConversationListItem,
  ConversationsResponse,
  Message,
  MessagesResponse,
} from '@/types'

interface TeamResponse {
  members: Agent[]
  aiAgents: { id: string; name: string }[]
}

type MessageStatusPayload = {
  conversationId?: string
  messageId?: string
  waMessageId?: string
  status: string
  scope?: string
}

function messagePreview(message: Message): string {
  if (message.type === 'text') return (message.body ?? '').slice(0, 120)
  return `[${message.type}]`
}

function patchMessages(
  old: MessagesResponse | undefined,
  payload: MessageStatusPayload,
): MessagesResponse | undefined {
  if (!old) return old

  const normalized = normalizeMessageStatus(payload.status)
  if (!normalized) return old

  let changed = false
  const messages = old.messages.map((m) => {
    if (m.direction !== 'outbound') return m
    const idMatch = payload.messageId != null && m.id === payload.messageId
    const waMatch = payload.waMessageId != null && m.waMessageId === payload.waMessageId
    if (!idMatch && !waMatch) return m
    const next = mergeMessageStatus(m.status, normalized)
    if (next === m.status) return m
    if (
      m.type === 'audio' &&
      m.status === 'pending' &&
      next === 'sent'
    ) {
      void playWaFeedbackAsync('sent')
    }
    changed = true
    return { ...m, status: next }
  })

  return changed ? { ...old, messages } : old
}

function appendMessage(
  old: MessagesResponse | undefined,
  message: Message,
): MessagesResponse {
  return upsertMessage(old, message)
}

type MessagingPatch = Partial<
  Pick<
    ConversationListItem,
    | 'windowExpiresAt'
    | 'fepExpiresAt'
    | 'ctwaStartedAt'
    | 'isWindowOpen'
    | 'isFepOpen'
    | 'isCtwaLead'
    | 'canSendSession'
    | 'canSendTemplate'
    | 'needsTemplateForReply'
  >
>

function patchInboxForNewMessage(
  old: InfiniteData<ConversationsResponse> | undefined,
  conversationId: string,
  message: Message,
  messaging?: MessagingPatch,
): InfiniteData<ConversationsResponse> | undefined {
  if (!old) return old

  let updated: ConversationListItem | undefined
  const pages = old.pages.map((page, pageIndex) => {
    const rest = page.conversations.filter((c) => {
      if (c.id !== conversationId) return true
      updated = normalizeConversation({
        ...c,
        lastMessageAt: message.sentAt,
        lastMessagePreview: messagePreview(message),
        lastMessageId: message.id,
        lastMessageDirection: message.direction,
        lastMessageStatus: message.status,
        lastMessageType: message.type,
        unreadCount:
          message.direction === 'inbound' ? c.unreadCount + 1 : c.unreadCount,
        ...(messaging ?? {}),
      })
      return false
    })
    if (!updated) return page
    if (pageIndex === 0) {
      return { ...page, conversations: [updated, ...rest] }
    }
    return { ...page, conversations: rest }
  })

  return updated ? { ...old, pages } : old
}

function patchMessageMedia(
  old: MessagesResponse | undefined,
  messageId: string,
  patch: Pick<Message, 'mediaUrl' | 'mediaStatus'>,
): MessagesResponse | undefined {
  if (!old) return old
  let changed = false
  const messages = old.messages.map((m) => {
    if (m.id !== messageId) return m
    changed = true
    return { ...m, ...patch }
  })
  return changed ? { ...old, messages } : old
}

/**
 * App-level socket lifecycle + cache wiring.
 * - new_message / media_ready / message_status -> patch caches directly
 * - conversation_updated / conversation_assigned / inbox_updated -> refresh list
 */
export function useSocketSync() {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!accessToken) return
    const socket = connectSocket()

    const refreshInbox = () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }

    const onInboxUpdated = (payload: {
      conversationId?: string
      unreadCount?: number
    }) => {
      if (payload.conversationId != null && payload.unreadCount != null) {
        queryClient.setQueriesData<InfiniteData<ConversationsResponse>>(
          { queryKey: ['conversations'] },
          (old) =>
            patchConversationUnreadCount(old, payload.conversationId!, payload.unreadCount!),
        )
        return
      }
      refreshInbox()
    }

    const onNewMessage = ({
      conversationId,
      message,
      ...messaging
    }: {
      conversationId: string
      message: Message
    } & MessagingPatch) => {
      const normalized = normalizeMessage(message as Message & Record<string, unknown>)
      queryClient.setQueryData<MessagesResponse>(
        ['messages', conversationId],
        (old) => appendMessage(old, normalized),
      )

      const hasMessaging = messaging.windowExpiresAt != null

      if (hasMessaging) {
        queryClient.setQueryData<ConversationDetail>(
          ['conversation', conversationId],
          (old) => (old ? normalizeConversation({ ...old, ...messaging }) : old),
        )
      }

      queryClient.setQueriesData<InfiniteData<ConversationsResponse>>(
        { queryKey: ['conversations'] },
        (old) => patchInboxForNewMessage(old, conversationId, message, messaging),
      )

      if (normalized.mediaUrl || normalized.localPreviewUri) {
        void syncMessageMedia(normalized)
      }
    }

    const onMessageStatus = (payload: MessageStatusPayload) => {
      if (payload.scope === 'inbound') return

      const patch = (old: MessagesResponse | undefined) => patchMessages(old, payload)

      if (payload.conversationId) {
        queryClient.setQueryData<MessagesResponse>(
          ['messages', payload.conversationId],
          patch,
        )
        const normalizedStatus = normalizeMessageStatus(payload.status)
        if (payload.messageId && normalizedStatus) {
          queryClient.setQueriesData<InfiniteData<ConversationsResponse>>(
            { queryKey: ['conversations'] },
            (old) =>
              patchConversationLastMessageStatus(
                old,
                payload.conversationId!,
                payload.messageId!,
                normalizedStatus,
              ),
          )
        }
      }

      if (payload.messageId || payload.waMessageId) {
        queryClient.setQueriesData<MessagesResponse>({ queryKey: ['messages'] }, patch)
      }
    }

    const onMediaReady = ({
      conversationId,
      messageId,
      mediaUrl,
    }: {
      conversationId?: string
      messageId: string
      mediaUrl: string
    }) => {
      const patch = (old: MessagesResponse | undefined) =>
        patchMessageMedia(old, messageId, { mediaUrl, mediaStatus: 'uploaded' })

      if (conversationId) {
        queryClient.setQueryData<MessagesResponse>(
          ['messages', conversationId],
          patch,
        )
      } else {
        queryClient.setQueriesData<MessagesResponse>({ queryKey: ['messages'] }, patch)
      }

      void queryClient.invalidateQueries({ queryKey: ['media', mediaUrl] })

      if (conversationId) {
        const data = queryClient.getQueryData<MessagesResponse>(['messages', conversationId])
        const msg = data?.messages.find((m) => m.id === messageId)
        if (msg) void syncMessageMedia({ ...msg, mediaUrl, mediaStatus: 'uploaded' })
      }
    }

    const onMediaFailed = ({
      conversationId,
      messageId,
    }: {
      conversationId?: string
      messageId: string
    }) => {
      const patch = (old: MessagesResponse | undefined) =>
        patchMessageMedia(old, messageId, { mediaUrl: null, mediaStatus: 'failed' })

      if (conversationId) {
        queryClient.setQueryData<MessagesResponse>(
          ['messages', conversationId],
          patch,
        )
      } else {
        queryClient.setQueriesData<MessagesResponse>({ queryKey: ['messages'] }, patch)
      }
    }

    const onMessageUpdated = ({
      conversationId,
      message,
    }: {
      conversationId: string
      message: Message
    }) => {
      const normalized = normalizeMessage(message as Message & Record<string, unknown>)
      const patch = (old: MessagesResponse | undefined) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === normalized.id
              ? {
                  ...normalized,
                  localPreviewUri: normalized.localPreviewUri ?? m.localPreviewUri,
                }
              : m,
          ),
        }
      }
      queryClient.setQueryData<MessagesResponse>(['messages', conversationId], patch)
      queryClient.setQueriesData<MessagesResponse>({ queryKey: ['messages'] }, patch)
    }

    const onMessageDeleted = ({
      conversationId,
      messageId,
    }: {
      conversationId: string
      messageId: string
    }) => {
      const patch = (old: MessagesResponse | undefined) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === messageId
              ? { ...m, deletedAt: new Date().toISOString(), body: null }
              : m,
          ),
        }
      }
      queryClient.setQueryData<MessagesResponse>(['messages', conversationId], patch)
      queryClient.setQueriesData<MessagesResponse>({ queryKey: ['messages'] }, patch)
    }

    const patchTeamPresence = (agentId: string, isOnline: boolean) => {
      queryClient.setQueryData<TeamResponse>(['team'], (old) => {
        if (!old) return old
        return {
          ...old,
          members: old.members.map((m) =>
            m.id === agentId ? { ...m, isOnline } : m,
          ),
        }
      })
    }

    const onAgentOnline = ({ agentId }: { agentId: string }) => {
      patchTeamPresence(agentId, true)
    }

    const onAgentOffline = ({ agentId }: { agentId: string }) => {
      patchTeamPresence(agentId, false)
    }

    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    }

    socket.on('connect', onReconnect)
    socket.on('new_message', onNewMessage)
    socket.on('message_status', onMessageStatus)
    socket.on('message_updated', onMessageUpdated)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('media_ready', onMediaReady)
    socket.on('media_failed', onMediaFailed)
    socket.on('conversation_updated', refreshInbox)
    socket.on('conversation_assigned', refreshInbox)
    socket.on('inbox_updated', onInboxUpdated)
    socket.on('agent_online', onAgentOnline)
    socket.on('agent_offline', onAgentOffline)

    return () => {
      socket.off('connect', onReconnect)
      socket.off('new_message', onNewMessage)
      socket.off('message_status', onMessageStatus)
      socket.off('message_updated', onMessageUpdated)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('media_ready', onMediaReady)
      socket.off('media_failed', onMediaFailed)
      socket.off('conversation_updated', refreshInbox)
      socket.off('conversation_assigned', refreshInbox)
      socket.off('inbox_updated', onInboxUpdated)
      socket.off('agent_online', onAgentOnline)
      socket.off('agent_offline', onAgentOffline)
    }
  }, [accessToken, queryClient])

  useEffect(() => {
    return () => {
      if (!useAuthStore.getState().accessToken) disconnectSocket()
    }
  }, [])
}

/** Join/leave a conversation room for the lifetime of a chat screen. */
export function useConversationRoom(conversationId: string | undefined) {
  useEffect(() => {
    if (!conversationId) return
    const socket = getSocket()
    socket.emit('join_conversation', conversationId)
    return () => {
      socket.emit('leave_conversation', conversationId)
    }
  }, [conversationId])
}
