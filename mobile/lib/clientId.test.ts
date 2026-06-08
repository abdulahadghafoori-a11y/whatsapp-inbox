import { describe, it, expect } from 'vitest'
import { newPendingId } from '@/lib/clientId'

describe('newPendingId', () => {
  it('embeds the kind and the pending prefix', () => {
    expect(newPendingId('text')).toMatch(/^pending-text-\d+-[a-z0-9]+$/)
    expect(newPendingId('media')).toMatch(/^pending-media-/)
    expect(newPendingId('location')).toMatch(/^pending-location-/)
  })

  it('never collides across a tight burst (same millisecond)', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 5000; i++) ids.add(newPendingId('media'))
    expect(ids.size).toBe(5000)
  })
})
