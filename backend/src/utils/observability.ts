import * as Sentry from '@sentry/node'
import { config } from '../config.js'

let enabled = false

/** Initialize Sentry if a DSN is configured. No-op otherwise. Call once at boot. */
export function initObservability(): void {
  if (!config.SENTRY_DSN) return
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0,
  })
  enabled = true
}

export function isObservabilityEnabled(): boolean {
  return enabled
}

/** Report an exception to Sentry (no-op when disabled). */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
