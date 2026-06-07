import { describe, it, expect } from 'vitest'
import { jobBackoffMinutes } from './job-processor.js'

describe('jobBackoffMinutes', () => {
  it('uses 1m, 5m, then 30m backoff', () => {
    expect(jobBackoffMinutes(1)).toBe(1)
    expect(jobBackoffMinutes(2)).toBe(5)
    expect(jobBackoffMinutes(3)).toBe(30)
    expect(jobBackoffMinutes(10)).toBe(30)
  })
})
