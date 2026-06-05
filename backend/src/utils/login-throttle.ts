/**
 * Per-(IP+email) login throttle. The route-level @fastify/rate-limit keys on IP
 * only, because its keyGenerator runs in `onRequest` before the body is parsed.
 * This in-memory fixed-window guard adds per-email protection (e.g. distributed
 * credential stuffing against one account from many IPs). Single-process deploy,
 * so an in-memory map matches the rate-limit plugin's default store.
 */
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_ATTEMPT_MAX = 10

type Entry = { count: number; resetAt: number }

export class LoginThrottle {
  private readonly attempts = new Map<string, Entry>()

  constructor(
    private readonly max = LOGIN_ATTEMPT_MAX,
    private readonly windowMs = LOGIN_ATTEMPT_WINDOW_MS,
  ) {}

  /** Returns false when the key has exceeded the allowed attempts in the window. */
  register(key: string, now = Date.now()): boolean {
    if (this.attempts.size > 5000) {
      for (const [k, v] of this.attempts) if (v.resetAt < now) this.attempts.delete(k)
    }
    const entry = this.attempts.get(key)
    if (!entry || entry.resetAt < now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    if (entry.count >= this.max) return false
    entry.count++
    return true
  }

  /** Clear the counter for a key (call on successful login). */
  clear(key: string): void {
    this.attempts.delete(key)
  }
}
