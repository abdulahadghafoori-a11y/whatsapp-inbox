import { describe, expect, it } from 'vitest'
import {
  markPaginationAtLength,
  releasePaginationAtLength,
  resetPaginationTracker,
  shouldSkipPaginationAtLength,
} from '@/lib/chatListPagination'

describe('chatListPagination', () => {
  it('dedupes pagination per content length', () => {
    const tracker = {}
    expect(shouldSkipPaginationAtLength(tracker, 10)).toBe(false)
    markPaginationAtLength(tracker, 10)
    expect(shouldSkipPaginationAtLength(tracker, 10)).toBe(true)
    expect(shouldSkipPaginationAtLength(tracker, 11)).toBe(false)
  })

  it('resets tracker on conversation switch', () => {
    const tracker = {}
    markPaginationAtLength(tracker, 5)
    resetPaginationTracker(tracker)
    expect(shouldSkipPaginationAtLength(tracker, 5)).toBe(false)
  })

  it('releases tracker entry after delay', async () => {
    const tracker = {}
    markPaginationAtLength(tracker, 8)
    await new Promise<void>((resolve) => {
      releasePaginationAtLength(tracker, 8, 10)
      setTimeout(resolve, 20)
    })
    expect(shouldSkipPaginationAtLength(tracker, 8)).toBe(false)
  })
})
