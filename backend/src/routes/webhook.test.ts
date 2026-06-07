import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  isWebhookSignatureValid,
  verifyChakraSignature,
  verifyMetaSignature,
  verifySignature,
} from './webhook.js'

const META_SECRET = 'test_app_secret' // matches vitest.config env
const CHAKRA_SECRET = 'chakra_team_hmac_secret'

function signMeta(body: string): string {
  return 'sha256=' + createHmac('sha256', META_SECRET).update(Buffer.from(body)).digest('hex')
}

function signChakra(body: string): string {
  return createHmac('sha256', CHAKRA_SECRET).update(Buffer.from(body)).digest('hex')
}

describe('verifyMetaSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

  it('accepts a valid signature', () => {
    expect(verifyMetaSignature(Buffer.from(body), signMeta(body))).toBe(true)
    expect(verifySignature(Buffer.from(body), signMeta(body))).toBe(true)
  })

  it('rejects a tampered body', () => {
    const sig = signMeta(body)
    expect(verifyMetaSignature(Buffer.from(body + 'x'), sig)).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifyMetaSignature(Buffer.from(body), undefined)).toBe(false)
  })

  it('rejects a malformed signature header', () => {
    expect(verifyMetaSignature(Buffer.from(body), 'not-a-sig')).toBe(false)
  })

  it('rejects a signature with invalid hex or wrong length', () => {
    expect(verifyMetaSignature(Buffer.from(body), 'sha256=abc')).toBe(false)
    expect(verifyMetaSignature(Buffer.from(body), 'sha256=' + 'ff'.repeat(31))).toBe(false)
  })
})

describe('verifyChakraSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

  it('accepts a valid Chakra signature (hex, no sha256= prefix)', () => {
    expect(verifyChakraSignature(Buffer.from(body), signChakra(body), CHAKRA_SECRET)).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyChakraSignature(Buffer.from(body + 'x'), signChakra(body), CHAKRA_SECRET)).toBe(
      false,
    )
  })

  it('rejects Meta-style sha256= prefix', () => {
    expect(
      verifyChakraSignature(Buffer.from(body), signMeta(body), CHAKRA_SECRET),
    ).toBe(false)
  })
})

describe('isWebhookSignatureValid', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  const raw = Buffer.from(body)

  it('accepts Meta signature when present', () => {
    expect(isWebhookSignatureValid(raw, signMeta(body), undefined)).toBe(true)
  })

  it('prefers Meta over Chakra when both headers are present', () => {
    const chakraSig = signChakra(body)
    expect(isWebhookSignatureValid(raw, signMeta(body), chakraSig)).toBe(true)
    expect(isWebhookSignatureValid(raw, 'sha256=' + '00'.repeat(32), chakraSig)).toBe(false)
  })

  it('rejects when no signature headers and skip is off', () => {
    expect(isWebhookSignatureValid(raw, undefined, undefined)).toBe(false)
  })

  it('rejects Chakra signature when secret is not configured', () => {
    expect(isWebhookSignatureValid(raw, undefined, signChakra(body))).toBe(false)
  })
})
