import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { isSessionClearing, useAuthStore } from '@/stores/authStore'
import { reauthSocket } from '@/lib/socket'
import { assertProductionTransportSecurity } from '@/lib/transportSecurity'

assertProductionTransportSecurity()

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)
const API_URL = API_BASE_URL

export const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 20000,
})

// Bare client for auth calls (no interceptors -> no refresh recursion).
const bare = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 })

function isAuthRoute(url: string | undefined): boolean {
  if (!url) return false
  return url.includes('/auth/login') || url.includes('/auth/refresh')
}

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  // Let React Native set multipart boundary (manual Content-Type breaks uploads).
  if (cfg.data instanceof FormData) {
    delete cfg.headers['Content-Type']
  }
  return cfg
})

// Single-flight refresh: concurrent 401s share one refresh promise until it settles.
let refreshPromise: Promise<string | null> | null = null

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
    if (!isSessionClearing()) await useAuthStore.getState().clear()
    return null
  }
}

export function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
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
  await refreshAccessTokenSingleFlight()
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
      if (!isSessionClearing()) await useAuthStore.getState().clear()
      return Promise.reject(error)
    }

    if (status === 401 && original && !original._retried && !isAuthRoute(original.url)) {
      original._retried = true
      const newToken = await refreshAccessTokenSingleFlight()
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

export function getApiErrorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined
  return (err.response?.data as { code?: string } | undefined)?.code
}

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return 'Network error. Check your connection and try again.'
    }
    const data = err.response.data as { error?: string; code?: string } | undefined
    if (data?.error) return data.error
    if (err.response.status === 429) {
      return 'Too many requests. Please wait a moment and try again.'
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}
