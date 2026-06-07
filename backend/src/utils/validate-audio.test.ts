import { describe, expect, it } from 'vitest'
import { validateAudioForWhatsApp } from './validate-audio.js'

describe('validateAudioForWhatsApp', () => {
  it('accepts OGG Opus voice notes', () => {
    const buf = Buffer.alloc(400)
    buf.write('OggS', 0)
    const r = validateAudioForWhatsApp(buf, 'voice.ogg', 'audio/ogg')
    expect(r.voiceNote).toBe(true)
    expect(r.mime).toBe('audio/ogg')
  })

  it('rejects raw m4a without transcoding', () => {
    const buf = Buffer.alloc(400)
    buf.writeUInt32BE(0, 0)
    buf.write('ftyp', 4)
    buf.write('M4A ', 8)
    expect(() => validateAudioForWhatsApp(buf, 'voice.m4a', 'audio/mp4')).toThrow(/OGG Opus/)
  })

  it('rejects too-short audio', () => {
    expect(() => validateAudioForWhatsApp(Buffer.alloc(50), 'x.ogg', 'audio/ogg')).toThrow(/too short/)
  })
})
