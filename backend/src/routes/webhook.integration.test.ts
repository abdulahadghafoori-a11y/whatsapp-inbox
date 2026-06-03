import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>()
  return {
    ...actual,
    config: { ...actual.config, WEBHOOK_SKIP_SIGNATURE: false },
    isProd: false,
  }
})

import { webhookRoutes } from './webhook.js'

const SECRET = 'test_app_secret'

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('webhook POST (Fastify)', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    await app.register(webhookRoutes, { prefix: '/api/webhook' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('accepts a correctly signed JSON body', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(body),
      },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('rejects unsigned body when WEBHOOK_SKIP_SIGNATURE is off', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload: body,
    })
    expect(res.statusCode).toBe(403)
  })
})
