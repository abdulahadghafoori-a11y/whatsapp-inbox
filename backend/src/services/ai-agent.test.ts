import { describe, it, expect } from 'vitest'
import { parseEscalationSignal } from './ai-agent.js'

describe('parseEscalationSignal', () => {
  it('detects ESCALATE: with reason', () => {
    expect(parseEscalationSignal('ESCALATE:customer wants a refund')).toBe(
      'customer wants a refund',
    )
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseEscalationSignal('  escalate:  upset customer  ')).toBe('upset customer')
  })

  it('returns a default reason when the model emits ESCALATE: alone', () => {
    expect(parseEscalationSignal('ESCALATE:')).toBe('Escalation requested')
  })

  it('returns null for normal replies', () => {
    expect(parseEscalationSignal('Happy to help with your order!')).toBeNull()
    expect(parseEscalationSignal('Please ESCALATE: not in the middle')).toBeNull()
  })
})
