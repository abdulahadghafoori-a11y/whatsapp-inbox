import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry.js'

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stops when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(
      withRetry(fn, { attempts: 5, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always'))
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('always')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
