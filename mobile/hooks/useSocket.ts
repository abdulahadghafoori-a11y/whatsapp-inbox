import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { setActiveConversationId } from '@/lib/activeConversation'
import { useAuthStore } from '@/stores/authStore'
import type { Agent } from '@/types'

interface TeamResponse {
  members: Agent[]
  aiAgents: { id: string; name: string }[]
}

/**
 * App-level socket lifecycle. Message/conversation data is reconciled by the
 * SyncBridge (change-feed pulls into SQLite); this hook only keeps the
 * conversation-detail query fresh and tracks team presence.
 */
export function useSocketSync() {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!accessToken) return
    const socket = connectSocket()

    const invalidateConversation = (payload: { conversationId?: string }) => {
      if (payload?.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ['conversation', payload.conversationId],
        })
      }
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

    const onAgentOnline = ({ agentId }: { agentId: string }) =>
      patchTeamPresence(agentId, true)
    const onAgentOffline = ({ agentId }: { agentId: string }) =>
      patchTeamPresence(agentId, false)

    let hasConnectedOnce = false
    const onReconnect = () => {
      if (!hasConnectedOnce) {
        hasConnectedOnce = true
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    }

    socket.on('connect', onReconnect)
    socket.on('new_message', invalidateConversation)
    socket.on('conversation_updated', invalidateConversation)
    socket.on('conversation_assigned', invalidateConversation)
    socket.on('agent_online', onAgentOnline)
    socket.on('agent_offline', onAgentOffline)

    return () => {
      socket.off('connect', onReconnect)
      socket.off('new_message', invalidateConversation)
      socket.off('conversation_updated', invalidateConversation)
      socket.off('conversation_assigned', invalidateConversation)
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
