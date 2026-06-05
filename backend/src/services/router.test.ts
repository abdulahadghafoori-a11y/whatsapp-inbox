import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { bucket } from './router.js'

describe('router bucket', () => {
  it('is deterministic for the same id', () => {
    const id = randomUUID()
    expect(bucket(id)).toBe(bucket(id))
  })

  it('always returns a value in [0, 99]', () => {
    for (let i = 0; i < 1000; i++) {
      const b = bucket(randomUUID())
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(99)
    }
  })

  it('distributes roughly in proportion to the AI fraction', () => {
    // With a 10% fraction (bucket < 10), expect ~10% of ids to fall in the AI band.
    const n = 5000
    let inBand = 0
    for (let i = 0; i < n; i++) {
      if (bucket(randomUUID()) < 10) inBand++
    }
    const ratio = inBand / n
    expect(ratio).toBeGreaterThan(0.06)
    expect(ratio).toBeLessThan(0.14)
  })
})
