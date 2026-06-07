import { describe, it, expect, vi, beforeEach } from 'vitest'

const returning = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({ returning }),
      }),
    }),
  },
}))

import { claimWebhookEvent, WEBHOOK_PROCESSING_PREFIX } from './webhook-inbox.js'

beforeEach(() => {
  returning.mockReset()
})

describe('claimWebhookEvent', () => {
  it('returns true when the update claims a row', async () => {
    returning.mockResolvedValue([{ id: 'evt-1' }])
    await expect(claimWebhookEvent('evt-1')).resolves.toBe(true)
  })

  it('returns false when another worker already claimed or processed the row', async () => {
    returning.mockResolvedValue([])
    await expect(claimWebhookEvent('evt-1')).resolves.toBe(false)
  })

  it('tags in-flight work with a processing prefix', async () => {
    returning.mockResolvedValue([{ id: 'evt-1' }])
    await claimWebhookEvent('evt-1')
    expect(WEBHOOK_PROCESSING_PREFIX).toBe('processing:')
  })
})
