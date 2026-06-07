import { describe, it, expect } from 'vitest'
import { parseRefreshToken } from './refresh-token.js'

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

describe('parseRefreshToken', () => {
  it('parses id.secret', () => {
    expect(parseRefreshToken(`${VALID_ID}.abc123`)).toEqual({
      id: VALID_ID,
      secret: 'abc123',
    })
  })

  it('allows secrets containing dots', () => {
    expect(parseRefreshToken(`${VALID_ID}.a.b.c`)).toEqual({
      id: VALID_ID,
      secret: 'a.b.c',
    })
  })

  it('rejects missing secret', () => {
    expect(() => parseRefreshToken(`${VALID_ID}.`)).toThrow(/Malformed/)
  })

  it('rejects non-uuid id', () => {
    expect(() => parseRefreshToken('not-a-uuid.secret')).toThrow(/Malformed/)
  })
})
