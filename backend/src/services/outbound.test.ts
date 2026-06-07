import { describe, it, expect } from 'vitest'
import { metadataWithoutSendInFlight } from './outbound.js'

describe('metadataWithoutSendInFlight', () => {
  it('removes sendInFlightAt and keeps other fields', () => {
    expect(
      metadataWithoutSendInFlight({
        sendInFlightAt: '2026-01-01T00:00:00.000Z',
        templateName: 'hello',
        languageCode: 'en',
      }),
    ).toEqual({ templateName: 'hello', languageCode: 'en' })
  })

  it('returns null when only sendInFlightAt was present', () => {
    expect(metadataWithoutSendInFlight({ sendInFlightAt: 'x' })).toBeNull()
  })

  it('returns null for empty metadata', () => {
    expect(metadataWithoutSendInFlight(null)).toBeNull()
  })
})
