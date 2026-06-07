import { create } from 'zustand'
import type { Agent } from '@/types'
import { tokenStorage } from '@/lib/tokenStorage'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  agent: Agent | null
  hydrated: boolean

  hydrate: () => Promise<void>
  setSession: (accessToken: string, refreshToken: string, agent?: Agent) => Promise<void>
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>
  clear: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  agent: null,
  hydrated: false,

  async hydrate() {
    try {
      const { accessToken, refreshToken } = await tokenStorage.get()
      if (!accessToken && !refreshToken) {
        set({ accessToken: null, refreshToken: null, agent: null, hydrated: true })
        return
      }
      set({ accessToken, refreshToken, hydrated: true })
      try {
        const { api, ensureAccessTokenFresh } = await import('@/services/api')
        if (!accessToken && refreshToken) {
          await ensureAccessTokenFresh(0)
        }
        const res = await api.get<{ agent: Agent }>('/auth/me')
        set({ agent: res.data.agent })
      } catch {
        /* interceptor may refresh or clear the session */
      }
    } catch {
      set({ hydrated: true })
    }
  },

  async setSession(accessToken, refreshToken, agent) {
    await tokenStorage.set(accessToken, refreshToken)
    set({ accessToken, refreshToken, ...(agent ? { agent } : {}) })
  },

  async setTokens(accessToken, refreshToken) {
    await tokenStorage.set(accessToken, refreshToken)
    set({ accessToken, refreshToken })
  },

  async clear() {
    try {
      const { clearPushRegistration } = await import('@/lib/push')
      await clearPushRegistration()
    } catch {
      /* best-effort; token may already be invalid */
    }
    await tokenStorage.clear()
    set({ accessToken: null, refreshToken: null, agent: null })
    // Wipe all on-device data so the next agent on this device can't see the
    // previous session's conversations, messages, media, or queued sends.
    try {
      const [
        { queryClient, queryPersister },
        { clearOutboundQueue },
        { clearMediaQueue },
        { clearMediaCache, cleanupUploadTempFiles },
        { disconnectSocket },
      ] = await Promise.all([
        import('@/lib/queryClient'),
        import('@/lib/offlineQueue'),
        import('@/lib/offlineMediaQueue'),
        import('@/lib/messageMediaCache'),
        import('@/lib/socket'),
      ])
      disconnectSocket()
      queryClient.clear()
      await queryPersister.removeClient()
      await clearOutboundQueue()
      await clearMediaQueue()
      await clearMediaCache()
      await cleanupUploadTempFiles()
    } catch {
      /* best-effort cleanup */
    }
  },
}))
