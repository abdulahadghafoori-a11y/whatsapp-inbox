import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>()
  return {
    ...actual,
    config: {
      ...actual.config,
      WEBHOOK_SKIP_SIGNATURE: false,
      WHATSAPP_APP_SECRET: 'test_app_secret',
      CHAKRA_WEBHOOK_HMAC_SECRET: 'chakra_team_hmac_secret',
    },
    isProd: false,
  }
})

vi.mock('../services/webhook-inbox.js', () => ({
  persistWebhookPayload: vi.fn(async () => '00000000-0000-4000-8000-000000000001'),
  processWebhookEvent: vi.fn(async () => undefined),
}))

import { webhookRoutes } from './webhook.js'

const META_SECRET = 'test_app_secret'
const CHAKRA_SECRET = 'chakra_team_hmac_secret'

function signMeta(body: string): string {
  return 'sha256=' + createHmac('sha256', META_SECRET).update(body).digest('hex')
}

function signChakra(body: string): string {
  return createHmac('sha256', CHAKRA_SECRET).update(body).digest('hex')
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
        'x-hub-signature-256': signMeta(body),
      },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('accepts a correctly signed Chakra JSON body', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-chakra-signature-256': signChakra(body),
      },
      payload: body,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('accepts Chakra signature when Meta passthrough header is stale', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhook/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=' + '00'.repeat(32),
        'x-chakra-signature-256': signChakra(body),
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
