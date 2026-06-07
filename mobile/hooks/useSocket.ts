import { useEffect } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import {
  patchConversationLastMessageStatus,
  patchConversationUnreadCount,
} from '@/hooks/useConversations'
import { normalizeConversation } from '@/lib/conversation'
import { patchInboxForNewMessage } from '@/lib/inboxCachePatch'
import { normalizeMessage } from '@/lib/normalizeMessage'
import {
  type MessagesInfinite,
  coerceAndPatchMessagesInfinite,
  coerceMessagesInfiniteData,
  flattenMessagesPages,
  mapMessagesInfinite,
  patchMessageMediaInfinite,
  patchMessagesStatusInfinite,
  upsertMessageInfinite,
} from '@/lib/messagesQueryCache'
import { queueMessageMediaSync } from '@/lib/messageMediaSync'
import { normalizeMessageStatus } from '@/lib/messageStatus'
import {
  getActiveConversationId,
  setActiveConversationId,
} from '@/lib/activeConversation'
import { useAuthStore } from '@/stores/authStore'
import type {
  Agent,
  ConversationDetail,
  ConversationListItem,
  ConversationsResponse,
  Message,
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
  errorMessage?: string | null
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
      queryClient.setQueryData<MessagesInfinite>(
        ['messages', conversationId],
        (old) =>
          upsertMessageInfinite(coerceMessagesInfiniteData(old), normalized),
      )

      const hasMessaging =
        messaging.windowExpiresAt != null ||
        messaging.fepExpiresAt != null ||
        messaging.ctwaStartedAt != null ||
        messaging.isWindowOpen != null ||
        messaging.isFepOpen != null ||
        messaging.isCtwaLead != null ||
        messaging.canSendSession != null ||
        messaging.canSendTemplate != null ||
        messaging.needsTemplateForReply != null

      if (hasMessaging) {
        queryClient.setQueryData<ConversationDetail>(
          ['conversation', conversationId],
          (old) => (old ? normalizeConversation({ ...old, ...messaging }) : old),
        )
      }

      // Don't bump the unread badge for a chat the agent is currently viewing.
      const suppressUnread = getActiveConversationId() === conversationId
      let inboxFound = false
      queryClient.setQueriesData<InfiniteData<ConversationsResponse>>(
        { queryKey: ['conversations'] },
        (old) => {
          const result = patchInboxForNewMessage(old, conversationId, normalized, {
            messaging,
            suppressUnread,
          })
          inboxFound = inboxFound || result.found
          return result.data
        },
      )
      if (!inboxFound) {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      }

      if (normalized.mediaUrl || normalized.localPreviewUri) {
        queueMessageMediaSync(normalized)
      }
    }

    const onMessageStatus = (payload: MessageStatusPayload) => {
      if (payload.scope === 'inbound') return

      const patch = (old: unknown) =>
        coerceAndPatchMessagesInfinite(old, (data) =>
          patchMessagesStatusInfinite(data, payload),
        )

      if (payload.conversationId) {
        queryClient.setQueryData(
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
        queryClient.setQueriesData<MessagesInfinite>({ queryKey: ['messages'] }, patch)
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
      const patch = (old: unknown) =>
        coerceAndPatchMessagesInfinite(old, (data) =>
          patchMessageMediaInfinite(data, messageId, {
            mediaUrl,
            mediaStatus: 'uploaded',
          }),
        )

      if (conversationId) {
        queryClient.setQueryData(['messages', conversationId], patch)
      } else {
        queryClient.setQueriesData<MessagesInfinite>({ queryKey: ['messages'] }, patch)
      }

      void queryClient.invalidateQueries({ queryKey: ['media', mediaUrl, messageId] })

      if (conversationId) {
        const data = queryClient.getQueryData<MessagesInfinite>(['messages', conversationId])
        const msg = flattenMessagesPages(data).find((m) => m.id === messageId)
        if (msg) {
          queueMessageMediaSync({ ...msg, mediaUrl, mediaStatus: 'uploaded' })
        }
      }
    }

    const onMediaFailed = ({
      conversationId,
      messageId,
    }: {
      conversationId?: string
      messageId: string
    }) => {
      const patch = (old: unknown) =>
        coerceAndPatchMessagesInfinite(old, (data) =>
          patchMessageMediaInfinite(data, messageId, {
            mediaUrl: null,
            mediaStatus: 'failed',
          }),
        )

      if (conversationId) {
        queryClient.setQueryData(['messages', conversationId], patch)
      } else {
        queryClient.setQueriesData<MessagesInfinite>({ queryKey: ['messages'] }, patch)
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
      const patch = (old: MessagesInfinite | undefined) =>
        mapMessagesInfinite(old, (m) =>
          m.id === normalized.id
            ? {
                ...normalized,
                localPreviewUri: normalized.localPreviewUri ?? m.localPreviewUri,
              }
            : m,
        )
      queryClient.setQueryData<MessagesInfinite>(['messages', conversationId], patch)
      queryClient.setQueriesData<MessagesInfinite>({ queryKey: ['messages'] }, patch)
    }

    const onMessageDeleted = ({
      conversationId,
      messageId,
    }: {
      conversationId: string
      messageId: string
    }) => {
      const patch = (old: MessagesInfinite | undefined) =>
        mapMessagesInfinite(old, (m) =>
          m.id === messageId
            ? { ...m, deletedAt: new Date().toISOString(), body: null }
            : m,
        )
      queryClient.setQueryData<MessagesInfinite>(['messages', conversationId], patch)
      queryClient.setQueriesData<MessagesInfinite>({ queryKey: ['messages'] }, patch)
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

    // 'connect' fires on first connection and every reconnect. Skip the first
    // (initial queries load on their own) and, on reconnect, refresh the list +
    // only the open chat. Was: every connect invalidated ALL message threads —
    // expensive and janky for agents with many cached conversations.
    let hasConnectedOnce = false
    const onReconnect = () => {
      if (!hasConnectedOnce) {
        hasConnectedOnce = true
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      const active = getActiveConversationId()
      if (active) {
        void queryClient.invalidateQueries({ queryKey: ['messages', active] })
      }
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
    const socket = connectSocket()
    const join = () => socket.emit('join_conversation', conversationId)
    const leave = () => socket.emit('leave_conversation', conversationId)

    setActiveConversationId(conversationId)
    if (socket.connected) join()
    else socket.on('connect', join)

    return () => {
      socket.off('connect', join)
      leave()
      setActiveConversationId(null)
    }
  }, [conversationId])
}
