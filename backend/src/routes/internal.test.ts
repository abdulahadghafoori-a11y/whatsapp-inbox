import { describe, expect, it, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { config } from '../config.js'
import { internalRoutes } from './internal.js'

const emitNewMessage = vi.fn()
vi.mock('../services/socket-events.js', () => ({
  emitNewMessage: (...args: unknown[]) => emitNewMessage(...args),
  emitMediaReady: vi.fn(),
  emitMediaFailed: vi.fn(),
  emitMessageStatus: vi.fn(),
  emitMessageUpdated: vi.fn(),
  emitMessageDeleted: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitConversationAssigned: vi.fn(),
}))

describe('POST /internal/socket-emit', () => {
  beforeEach(() => {
    emitNewMessage.mockClear()
  })

  async function buildApp() {
    const app = Fastify()
    app.decorate('io', {} as never)
    await app.register(internalRoutes, { prefix: '/internal' })
    return app
  }

  it('rejects missing worker secret', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/internal/socket-emit',
      payload: { type: 'conversation_updated', conversationId: crypto.randomUUID() },
    })
    expect(res.statusCode).toBe(403)
  })

  it('forwards validated emits to socket layer', async () => {
    const app = await buildApp()
    const conversationId = crypto.randomUUID()
    const res = await app.inject({
      method: 'POST',
      url: '/internal/socket-emit',
      headers: { 'x-worker-secret': config.WORKER_INTERNAL_SECRET },
      payload: {
        type: 'conversation_updated',
        conversationId,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})
