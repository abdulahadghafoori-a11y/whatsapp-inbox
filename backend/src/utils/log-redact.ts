import { isProd } from '../config.js'

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'whatsapp_access_token',
])

/** Strip tokens/passwords from log objects in production. */
export function redactForLog<T extends Record<string, unknown>>(obj: T): T {
  if (!isProd) return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase()
    if (SENSITIVE_KEYS.has(lower) || lower.includes('token') || lower.includes('password')) {
      out[k] = '[redacted]'
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactForLog(v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out as T
}
