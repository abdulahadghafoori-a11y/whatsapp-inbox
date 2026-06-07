import { useEffect, useState } from 'react'
import { connectSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/authStore'

/** Emit typing_start/stop while the agent composes a reply. */
export function useTypingEmitter(conversationId: string, draft: string) {
  useEffect(() => {
    if (!conversationId) return
    const socket = connectSocket()
    if (!socket.connected) return
    const text = draft.trim()
    if (!text) {
      socket.emit('typing_stop', conversationId)
      return
    }
    socket.emit('typing_start', conversationId)
    const stop = setTimeout(() => socket.emit('typing_stop', conversationId), 2800)
    return () => {
      clearTimeout(stop)
      socket.emit('typing_stop', conversationId)
    }
  }, [conversationId, draft])
}

export function useTypingIndicator(conversationId: string) {
  const myId = useAuthStore((s) => s.agent?.id)
  const [typingNames, setTypingNames] = useState<string[]>([])

  useEffect(() => {
    if (!conversationId) return
    const socket = connectSocket()
    const onTyping = (payload: {
      conversationId: string
      agentId: string
      typing: boolean
      agentName?: string
    }) => {
      if (payload.conversationId !== conversationId) return
      if (payload.agentId === myId) return
      setTypingNames((prev) => {
        const label = payload.agentName ?? 'Teammate'
        if (payload.typing) {
          return prev.includes(label) ? prev : [...prev, label]
        }
        return prev.filter((n) => n !== label)
      })
    }
    socket.on('typing_indicator', onTyping)
    return () => {
      socket.off('typing_indicator', onTyping)
    }
  }, [conversationId, myId])

  return typingNames
}
