import { describe, expect, it } from 'vitest'
import { mergeMessageStatus } from '@/lib/messageStatus'

describe('mergeMessageStatus', () => {
  it('never downgrades delivery state', () => {
    expect(mergeMessageStatus('delivered', 'sent')).toBe('delivered')
    expect(mergeMessageStatus('read', 'delivered')).toBe('read')
  })

  it('allows upgrades', () => {
    expect(mergeMessageStatus('sent', 'delivered')).toBe('delivered')
    expect(mergeMessageStatus('pending', 'sent')).toBe('sent')
  })

  it('failed overrides non-failed incoming', () => {
    expect(mergeMessageStatus('delivered', 'failed')).toBe('failed')
  })
})
