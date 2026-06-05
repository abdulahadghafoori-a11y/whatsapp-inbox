import * as Sentry from '@sentry/react-native'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN

let enabled = false

/** Initialize Sentry when a DSN is configured. No-op otherwise. Call once at boot. */
export function initErrorReporting(): void {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    // Keep tracing off by default; opt in per environment if needed.
    tracesSampleRate: 0,
  })
  enabled = true
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
