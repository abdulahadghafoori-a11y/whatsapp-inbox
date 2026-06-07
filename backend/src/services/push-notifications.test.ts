import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'

const request = vi.fn()
const findFirst = vi.fn()
const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }))

vi.mock('undici', () => ({ request: (...args: unknown[]) => request(...args) }))
vi.mock('../db/index.js', () => ({
  db: {
    query: { teamMembers: { findFirst: (...args: unknown[]) => findFirst(...args) } },
    update: (...args: unknown[]) => update(...args),
  },
}))

import { EXPO_PUSH_TOKEN_RE, sendPushNotification } from './push-notifications.js'

const log = {
  debug: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
} as unknown as FastifyBaseLogger

describe('EXPO_PUSH_TOKEN_RE', () => {
  it('accepts standard Expo tokens', () => {
    expect(EXPO_PUSH_TOKEN_RE.test('ExponentPushToken[abc123XYZ_-]')).toBe(true)
  })

  it('rejects arbitrary strings', () => {
    expect(EXPO_PUSH_TOKEN_RE.test('not-a-token')).toBe(false)
  })
})

describe('sendPushNotification', () => {
  beforeEach(() => {
    request.mockReset()
    findFirst.mockReset()
    update.mockClear()
  })

  it('no-ops when the agent has no token', async () => {
    findFirst.mockResolvedValue({ expoPushToken: null })
    await sendPushNotification(log, {
      agentId: 'agent-1',
      title: 'Hi',
      body: 'There',
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('clears stale tokens on DeviceNotRegistered without throwing', async () => {
    findFirst.mockResolvedValue({ expoPushToken: 'ExponentPushToken[abc]' })
    request.mockResolvedValue({
      statusCode: 200,
      body: {
        text: async () =>
          JSON.stringify({
            data: [
              {
                status: 'error',
                message: 'not registered',
                details: { error: 'DeviceNotRegistered' },
              },
            ],
          }),
      },
    })

    await sendPushNotification(log, {
      agentId: 'agent-1',
      title: 'Hi',
      body: 'There',
      data: { conversationId: 'conv-1' },
    })

    expect(update).toHaveBeenCalled()
    expect(log.info).toHaveBeenCalled()
  })

  it('throws on transient ticket errors so the job can retry', async () => {
    findFirst.mockResolvedValue({ expoPushToken: 'ExponentPushToken[abc]' })
    request.mockResolvedValue({
      statusCode: 200,
      body: {
        text: async () =>
          JSON.stringify({
            data: [{ status: 'error', message: 'upstream timeout', details: { error: 'MessageTooBig' } }],
          }),
      },
    })

    await expect(
      sendPushNotification(log, {
        agentId: 'agent-1',
        title: 'Hi',
        body: 'There',
      }),
    ).rejects.toThrow('upstream timeout')
  })
})
