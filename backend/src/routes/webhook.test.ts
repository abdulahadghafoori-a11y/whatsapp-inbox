import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { verifySignature } from './webhook.js'

const SECRET = 'test_app_secret' // matches vitest.config env

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex')
}

describe('verifySignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

  it('accepts a valid signature', () => {
    expect(verifySignature(Buffer.from(body), sign(body))).toBe(true)
  })

  it('rejects a tampered body', () => {
    const sig = sign(body)
    expect(verifySignature(Buffer.from(body + 'x'), sig)).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifySignature(Buffer.from(body), undefined)).toBe(false)
  })

  it('rejects a malformed signature header', () => {
    expect(verifySignature(Buffer.from(body), 'not-a-sig')).toBe(false)
  })

  it('rejects a signature with invalid hex or wrong length', () => {
    expect(verifySignature(Buffer.from(body), 'sha256=abc')).toBe(false)
    expect(verifySignature(Buffer.from(body), 'sha256=' + 'ff'.repeat(31))).toBe(false)
  })
})
