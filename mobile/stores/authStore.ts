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

/** True while `clear()` is in progress — stops refresh/logout recursion. */
let sessionClearing = false
export function isSessionClearing(): boolean {
  return sessionClearing
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
    if (sessionClearing) return
    sessionClearing = true

    // Drop the session first so AuthGate can redirect and interceptors stop
    // retrying. Was: clearPushRegistration() ran first → PATCH /team/me 401 →
    // refresh failed → recursive clear() → logout hung forever.
    await tokenStorage.clear()
    set({ accessToken: null, refreshToken: null, agent: null })
    try {
      const { disconnectSocket } = await import('@/lib/socket')
      disconnectSocket()
    } catch {
      /* best-effort */
    }

    // Wipe local data in the background — must not block the login redirect.
    void (async () => {
      try {
        const [
          { queryClient, queryPersister },
          { clearOutboundQueue },
          { clearMediaQueue },
          { clearMediaCache, cleanupUploadTempFiles },
          { clearAllLocalData },
          { clearConversationModuleCaches },
        ] = await Promise.all([
          import('@/lib/queryClient'),
          import('@/lib/offlineQueue'),
          import('@/lib/offlineMediaQueue'),
          import('@/lib/messageMediaCache'),
          import('@/lib/db/repo'),
          import('@/hooks/useConversations'),
        ])
        queryClient.clear()
        await queryPersister.removeClient()
        await clearOutboundQueue()
        await clearMediaQueue()
        await clearMediaCache()
        await clearAllLocalData()
        clearConversationModuleCaches()
        await cleanupUploadTempFiles()
      } catch {
        /* best-effort cleanup */
      } finally {
        sessionClearing = false
      }
    })()
  },
}))
