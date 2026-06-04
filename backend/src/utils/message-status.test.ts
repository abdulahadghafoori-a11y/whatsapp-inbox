import { describe, expect, it } from 'vitest'
import {
  normalizeStatusForMessageType,
  normalizeWaMessageStatus,
  shouldUpgradeStatus,
} from './message-status.js'

describe('message-status', () => {
  it('maps webhook strings to stored status', () => {
    expect(normalizeWaMessageStatus('sent')).toBe('sent')
    expect(normalizeWaMessageStatus('delivered')).toBe('delivered')
    expect(normalizeWaMessageStatus('read')).toBe('read')
    expect(normalizeWaMessageStatus('played')).toBe('played')
  })

  it('played is stored only for voice notes', () => {
    expect(normalizeStatusForMessageType('audio', 'played')).toBe('played')
    expect(normalizeStatusForMessageType('text', 'played')).toBe('read')
    expect(normalizeStatusForMessageType('image', 'read')).toBe('read')
  })

  it('never downgrades status', () => {
    expect(shouldUpgradeStatus('read', 'delivered')).toBe(false)
    expect(shouldUpgradeStatus('delivered', 'read')).toBe(true)
    expect(shouldUpgradeStatus('read', 'played')).toBe(true)
    expect(shouldUpgradeStatus('played', 'read')).toBe(false)
  })
})
