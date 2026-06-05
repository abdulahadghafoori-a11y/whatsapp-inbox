import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB so we can force a handler failure without a live database.
const findFirst = vi.fn()
vi.mock('../db/index.js', () => ({
  db: {
    query: { messages: { findFirst: (...a: unknown[]) => findFirst(...a) } },
  },
}))

import { processWebhookPayload } from './webhook-processor.js'

const fakeApp = {
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  io: {},
} as never

beforeEach(() => {
  findFirst.mockReset()
})

describe('processWebhookPayload error propagation', () => {
  it('throws when a change handler fails (so the event stays unprocessed/replayable)', async () => {
    // A status entry triggers a db.query.messages.findFirst lookup; make it fail.
    findFirst.mockRejectedValue(new Error('db down'))
    const payload = {
      entry: [
        {
          changes: [
            { field: 'messages', value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } },
          ],
        },
      ],
    }
    await expect(processWebhookPayload(fakeApp, payload)).rejects.toThrow(/webhook processing failed/i)
  })

  it('does not throw for a payload with no actionable changes', async () => {
    const payload = { entry: [{ changes: [{ field: 'unknown', value: { foo: 'bar' } }] }] }
    await expect(processWebhookPayload(fakeApp, payload)).resolves.toBeUndefined()
  })

  it('does not throw for an empty payload', async () => {
    await expect(processWebhookPayload(fakeApp, {})).resolves.toBeUndefined()
  })
})
