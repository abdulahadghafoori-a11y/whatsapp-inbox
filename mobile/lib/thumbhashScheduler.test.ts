import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleThumbhashGeneration } from '@/lib/thumbhashScheduler'

describe('scheduleThumbhashGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs jobs serially with a gap between starts', async () => {
    const order: string[] = []
    const job1 = vi.fn(async () => {
      order.push('start1')
      await Promise.resolve()
      order.push('end1')
    })
    const job2 = vi.fn(async () => {
      order.push('start2')
      await Promise.resolve()
      order.push('end2')
    })

    scheduleThumbhashGeneration(job1)
    scheduleThumbhashGeneration(job2)

    await vi.runAllTimersAsync()

    expect(job1).toHaveBeenCalledOnce()
    expect(job2).toHaveBeenCalledOnce()
    expect(order).toEqual(['start1', 'end1', 'start2', 'end2'])
  })
})
