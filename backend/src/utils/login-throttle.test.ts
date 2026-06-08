import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the login_attempts table so we can exercise the
// distributed throttle's allow/deny boundary without a live database.
const store = new Map<string, { count: number; resetAt: number }>()

vi.mock('../db/index.js', () => ({
  db: {
    insert: () => ({
      values: (v: { key: string; resetAt: Date }) => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            const now = Date.now()
            const existing = store.get(v.key)
            let count: number
            if (!existing || existing.resetAt < now) {
              count = 1
              store.set(v.key, { count, resetAt: v.resetAt.getTime() })
            } else {
              count = existing.count + 1
              existing.count = count
            }
            return Promise.resolve([{ count }])
          },
        }),
      }),
    }),
    delete: () => ({
      where: () => {
        store.clear()
        return Promise.resolve()
      },
    }),
  },
}))

const { registerAttempt, registerLoginAttempt, clearLoginAttempts } = await import(
  './login-throttle.js'
)

beforeEach(() => store.clear())

describe('distributed login throttle', () => {
  it('allows up to max attempts then blocks within the window', async () => {
    const key = 'ip:1.2.3.4:user@example.com'
    expect(await registerAttempt(key, 3, 1000)).toBe(true)
    expect(await registerAttempt(key, 3, 1000)).toBe(true)
    expect(await registerAttempt(key, 3, 1000)).toBe(true)
    expect(await registerAttempt(key, 3, 1000)).toBe(false)
  })

  it('clear resets the counters after a successful login', async () => {
    await registerLoginAttempt('1.2.3.4', 'user@example.com')
    await clearLoginAttempts('1.2.3.4', 'user@example.com')
    expect(await registerLoginAttempt('1.2.3.4', 'user@example.com')).toBe(true)
  })

  it('blocks once the per-account limit is exceeded across IPs', async () => {
    // 20 per-account attempts allowed; the 21st (from any IP) is blocked.
    let lastAllowed = true
    for (let i = 0; i < 21; i++) {
      lastAllowed = await registerLoginAttempt(`10.0.0.${i}`, 'victim@example.com')
    }
    expect(lastAllowed).toBe(false)
  })
})
