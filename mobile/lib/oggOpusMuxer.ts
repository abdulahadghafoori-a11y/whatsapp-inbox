/** Minimal OGG Opus file writer (RFC 7845) for WhatsApp voice notes. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0
    }
    table[i] = r
  }
  return table
})()

function oggCrc(page: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < page.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0
  }
  return crc
}

function writeString(buf: Uint8Array, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i)
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >> 8) & 0xff
  buf[offset + 2] = (value >> 16) & 0xff
  buf[offset + 3] = (value >> 24) & 0xff
}

function writeUint16LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >> 8) & 0xff
}

function buildOpusHead(sampleRate: number, preSkip: number): Uint8Array {
  const head = new Uint8Array(19)
  writeString(head, 0, 'OpusHead')
  head[8] = 1
  head[9] = 1
  writeUint16LE(head, 10, preSkip)
  writeUint32LE(head, 12, sampleRate)
  writeUint16LE(head, 16, 0)
  head[18] = 0
  return head
}

function buildOpusTags(): Uint8Array {
  const vendor = 'whatsapp-inbox'
  const buf = new Uint8Array(8 + 4 + vendor.length + 4)
  writeString(buf, 0, 'OpusTags')
  writeUint32LE(buf, 8, vendor.length)
  writeString(buf, 12, vendor)
  writeUint32LE(buf, 12 + vendor.length, 0)
  return buf
}

function buildOggPage(
  packets: Uint8Array[],
  headerType: number,
  granulePos: number,
  serial: number,
  sequence: number,
): Uint8Array {
  const segments: number[] = []
  for (const p of packets) {
    let remain = p.length
    while (remain >= 255) {
      segments.push(255)
      remain -= 255
    }
    segments.push(remain)
  }

  const headerSize = 27 + segments.length
  const bodySize = packets.reduce((s, p) => s + p.length, 0)
  const page = new Uint8Array(headerSize + bodySize)

  writeString(page, 0, 'OggS')
  page[4] = 0
  page[5] = headerType
  const granule = BigInt(granulePos)
  for (let i = 0; i < 8; i++) page[6 + i] = Number((granule >> BigInt(8 * i)) & 0xffn)
  writeUint32LE(page, 14, serial)
  writeUint32LE(page, 18, sequence)
  writeUint32LE(page, 22, 0)
  page[26] = segments.length

  for (let i = 0; i < segments.length; i++) page[27 + i] = segments[i]

  let offset = headerSize
  for (const p of packets) {
    page.set(p, offset)
    offset += p.length
  }

  writeUint32LE(page, 22, oggCrc(page))
  return page
}

/**
 * Mux raw Opus packets into a WhatsApp-compatible .ogg file.
 * Uses one Opus packet per Ogg page (best compatibility with strict decoders).
 */
export function muxOpusPacketsToOgg(
  packets: Uint8Array[],
  opts: { sampleRate: number; preSkip?: number; frameDurationMs?: number },
): Uint8Array {
  if (packets.length === 0) throw new Error('No audio captured')

  const sampleRate = opts.sampleRate
  const preSkip = opts.preSkip ?? 0
  const frameDurationMs = opts.frameDurationMs ?? 20
  const samplesPerFrame = Math.round((sampleRate * frameDurationMs) / 1000)
  const serial = (Math.random() * 0xffffffff) >>> 0

  const pages: Uint8Array[] = []
  // Page 0: OpusHead (BOS)
  pages.push(buildOggPage([buildOpusHead(sampleRate, preSkip)], 0x02, 0, serial, 0))
  // Page 1: OpusTags
  pages.push(buildOggPage([buildOpusTags()], 0x00, 0, serial, 1))

  let granule = 0
  let seq = 2

  for (let i = 0; i < packets.length; i++) {
    granule += samplesPerFrame
    const isLast = i === packets.length - 1
    const headerType = isLast ? 0x04 : 0x00 // EOS on final audio page
    pages.push(buildOggPage([packets[i]], headerType, granule, serial, seq++))
  }

  const total = pages.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of pages) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Dev/test helper — verify OggS + OpusHead + OpusTags ordering. */
export function assertOggOpusStructure(file: Uint8Array): void {
  if (file.length < 4 || String.fromCharCode(file[0], file[1], file[2], file[3]) !== 'OggS') {
    throw new Error('Missing OggS magic')
  }
  const headIdx = indexOfSubarray(file, stringToBytes('OpusHead'))
  const tagsIdx = indexOfSubarray(file, stringToBytes('OpusTags'))
  if (headIdx < 0 || tagsIdx < 0 || headIdx > tagsIdx) {
    throw new Error('OpusHead/OpusTags headers missing or out of order')
  }
}

function stringToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

function indexOfSubarray(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}
