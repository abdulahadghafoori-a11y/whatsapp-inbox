import { describe, it, expect, vi, beforeEach } from 'vitest'

const execute = vi.fn()
vi.mock('../db/index.js', () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }))

const pruneExpiredLoginAttempts = vi.fn()
vi.mock('../utils/login-throttle.js', () => ({
  pruneExpiredLoginAttempts: () => pruneExpiredLoginAttempts(),
}))

const { runRetention } = await import('./retention.js')

const app = { log: { info: vi.fn(), error: vi.fn() } } as never

beforeEach(() => {
  execute.mockReset().mockResolvedValue({ rowCount: 0 })
  pruneExpiredLoginAttempts.mockReset().mockResolvedValue(0)
})

describe('runRetention', () => {
  it('prunes done jobs, failed jobs, change_log, and expired login attempts', async () => {
    await runRetention(app)
    expect(execute).toHaveBeenCalledTimes(3)
    expect(pruneExpiredLoginAttempts).toHaveBeenCalledTimes(1)
  })

  it('swallows errors so the periodic loop keeps running', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))
    await expect(runRetention(app)).resolves.toBeUndefined()
  })
})
