import * as ImageManipulator from 'expo-image-manipulator'
import { decode as decodeJpeg } from 'jpeg-js'
import { rgbaToThumbHash } from 'thumbhash'

// ThumbHash requires both dimensions <= 100px.
const THUMBHASH_MAX_EDGE = 100

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = clean.length
  const bytes = new Uint8Array(Math.floor((len * 3) / 4))
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const c0 = B64.indexOf(clean[i]!)
    const c1 = B64.indexOf(clean[i + 1]!)
    const c2 = i + 2 < len ? B64.indexOf(clean[i + 2]!) : -1
    const c3 = i + 3 < len ? B64.indexOf(clean[i + 3]!) : -1
    bytes[p++] = (c0 << 2) | (c1 >> 4)
    if (c2 !== -1) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (c3 !== -1) bytes[p++] = ((c2 & 3) << 6) | c3
  }
  return bytes.subarray(0, p)
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

export interface GeneratedThumbhash {
  thumbhash: string
  width: number
  height: number
}

/**
 * Compute a ThumbHash (base64) from a local image file — runs off the render
 * path, once per blob. Returns null on any failure (caller falls back silently).
 */
export async function computeThumbhashFromUri(
  localUri: string,
): Promise<GeneratedThumbhash | null> {
  try {
    let small = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: THUMBHASH_MAX_EDGE } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    )
    // Portrait images stay taller than 100px after a width-only resize — clamp height.
    if (small.height > THUMBHASH_MAX_EDGE) {
      small = await ImageManipulator.manipulateAsync(
        small.uri,
        [{ resize: { height: THUMBHASH_MAX_EDGE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      )
    }
    if (!small.base64) return null

    const jpeg = decodeJpeg(base64ToBytes(small.base64), { useTArray: true })
    if (!jpeg?.data || jpeg.width < 1 || jpeg.height < 1) return null
    if (jpeg.width > THUMBHASH_MAX_EDGE || jpeg.height > THUMBHASH_MAX_EDGE) return null

    const hash = rgbaToThumbHash(jpeg.width, jpeg.height, jpeg.data)
    return { thumbhash: bytesToBase64(hash), width: jpeg.width, height: jpeg.height }
  } catch {
    return null
  }
}
