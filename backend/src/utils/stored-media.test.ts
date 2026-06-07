import { describe, expect, it } from 'vitest'
import { voiceNoteFromMime, waMimeFromStored } from './stored-media.js'

describe('stored-media', () => {
  it('detects voice notes from ogg mime', () => {
    expect(voiceNoteFromMime('audio/ogg')).toBe(true)
    expect(voiceNoteFromMime('audio/ogg; codecs=opus')).toBe(true)
    expect(voiceNoteFromMime('audio/mp4')).toBe(false)
  })

  it('strips mime parameters', () => {
    expect(waMimeFromStored('audio/ogg; codecs=opus')).toBe('audio/ogg')
  })
})
