import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory AsyncStorage stand-in.
const mem = new Map<string, string>()
vi.mock('@/lib/appStorage', () => ({
  appStorage: {
    getItem: (k: string) => Promise.resolve(mem.get(k) ?? null),
    setItem: (k: string, v: string) => {
      mem.set(k, v)
      return Promise.resolve()
    },
    removeItem: (k: string) => {
      mem.delete(k)
      return Promise.resolve()
    },
  },
}))

const post = vi.fn()
vi.mock('@/services/api', () => ({ api: { post: (...a: unknown[]) => post(...a) } }))

const deleteMessages = vi.fn().mockResolvedValue(undefined)
const putLocalMessage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/db/repo', () => ({
  deleteMessages: (...a: unknown[]) => deleteMessages(...a),
  putLocalMessage: (...a: unknown[]) => putLocalMessage(...a),
}))

const scheduleSync = vi.fn()
vi.mock('@/lib/sync/syncEngine', () => ({ scheduleSync: () => scheduleSync() }))

const {
  enqueueTextSend,
  loadOutboundQueue,
  flushOutboundQueue,
  clearOutboundQueue,
} = await import('@/lib/offlineQueue')

beforeEach(() => {
  mem.clear()
  post.mockReset()
  deleteMessages.mockClear()
  scheduleSync.mockClear()
})

describe('offlineQueue', () => {
  it('enqueues an optimistic pending message and persists it', async () => {
    const msg = await enqueueTextSend({ id: 'p1', conversationId: 'c1', body: 'hi' })
    expect(msg.status).toBe('pending')
    expect(msg.direction).toBe('outbound')
    const queue = await loadOutboundQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].body).toBe('hi')
  })

  it('flushes: posts each item, drops the placeholder, schedules a sync', async () => {
    post.mockResolvedValue({ data: {} })
    await enqueueTextSend({ id: 'p1', conversationId: 'c1', body: 'a' })
    await enqueueTextSend({ id: 'p2', conversationId: 'c1', body: 'b' })

    const res = await flushOutboundQueue()
    expect(res).toEqual({ sent: 2, failed: 0 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(deleteMessages).toHaveBeenCalledTimes(2)
    expect(scheduleSync).toHaveBeenCalledTimes(1)
    expect(await loadOutboundQueue()).toHaveLength(0)
  })

  it('keeps failed items queued for retry', async () => {
    post.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(new Error('offline'))
    await enqueueTextSend({ id: 'p1', conversationId: 'c1', body: 'a' })
    await enqueueTextSend({ id: 'p2', conversationId: 'c1', body: 'b' })

    const res = await flushOutboundQueue()
    expect(res).toEqual({ sent: 1, failed: 1 })
    const remaining = await loadOutboundQueue()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('p2')
  })

  it('clear empties the queue', async () => {
    await enqueueTextSend({ id: 'p1', conversationId: 'c1', body: 'a' })
    await clearOutboundQueue()
    expect(await loadOutboundQueue()).toHaveLength(0)
  })
})
