export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Decide whether an error is worth retrying. Default: retry everything. */
  shouldRetry?: (err: unknown) => boolean
  /** Called before each wait, with the upcoming delay in ms. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Exponential backoff with full jitter. Honors an explicit retry delay (e.g.
 * from a Retry-After header) when the thrown error exposes `retryAfterMs`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3
  const base = opts.baseDelayMs ?? 500
  const max = opts.maxDelayMs ?? 10_000
  const shouldRetry = opts.shouldRetry ?? (() => true)

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === attempts || !shouldRetry(err)) break

      const explicit =
        err && typeof err === 'object' && 'retryAfterMs' in err
          ? Number((err as { retryAfterMs?: number }).retryAfterMs)
          : undefined

      const backoff = Math.min(max, base * 2 ** (attempt - 1))
      const jittered = Math.round(Math.random() * backoff)
      const delay = explicit && !Number.isNaN(explicit) ? explicit : jittered

      opts.onRetry?.(err, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastErr
}
