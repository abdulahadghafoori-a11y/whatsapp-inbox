import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { reauthSocket } from '@/lib/socket'
import { assertProductionTransportSecurity } from '@/lib/transportSecurity'

assertProductionTransportSecurity()

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

export const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 20000,
})

// Bare client for the refresh call (no interceptors -> no recursion).
const bare = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 })

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  // Let React Native set multipart boundary (manual Content-Type breaks uploads).
  if (cfg.data instanceof FormData) {
    delete cfg.headers['Content-Type']
  }
  return cfg
})

// Single-flight refresh: concurrent 401s share one refresh promise.
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return null
  try {
    const res = await bare.post('/auth/refresh', { refreshToken })
    const { accessToken, refreshToken: newRefresh } = res.data as {
      accessToken: string
      refreshToken: string
    }
    await useAuthStore.getState().setTokens(accessToken, newRefresh)
    reauthSocket()
    return accessToken
  } catch {
    await useAuthStore.getState().clear()
    return null
  }
}

function jwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/** Refresh before long uploads — access token may expire during on-device video prep. */
export async function ensureAccessTokenFresh(skewMs = 60_000): Promise<void> {
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (!refreshToken) return
  const exp = accessToken ? jwtExpMs(accessToken) : null
  if (exp != null && exp > Date.now() + skewMs) return
  await refreshAccessToken()
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined

    const status = error.response?.status
    const code = (error.response?.data as { code?: string } | undefined)?.code

    // TOKEN_REVOKED can never be fixed by refresh -> log out immediately.
    if (status === 401 && code === 'TOKEN_REVOKED') {
      await useAuthStore.getState().clear()
      return Promise.reject(error)
    }

    if (status === 401 && original && !original._retried) {
      original._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const newToken = await refreshing
      refreshing = null
      // Multipart bodies are consumed on first send — caller must rebuild FormData.
      if (original.data instanceof FormData) {
        return Promise.reject(error)
      }
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
    }
    return Promise.reject(error)
  },
)

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined
    return data?.error ?? err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}
