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
      set({ accessToken, refreshToken, hydrated: true })
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
    await tokenStorage.clear()
    set({ accessToken: null, refreshToken: null, agent: null })
  },
}))
